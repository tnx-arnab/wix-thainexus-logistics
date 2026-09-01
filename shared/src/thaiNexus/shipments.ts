import { shipmentCrud, apiSuggestHsCode } from './client.js';
import { getApiToken } from './store.js';
import { listStoredOrderShipments } from '../d1/orderShipments.js';
import {
    ShipmentDetail,
    ShipmentListResponse,
    ShipmentSummary,
} from '../types/shipment.js';
import { ShipperProfile } from '../types/thaiNexus.js';
import { packItems, totalDeclaredValue } from '../packing.js';
import { BcRateItem, ShippingBox } from '../types/thaiNexus.js';
import { normalizeHsCode } from '../hsCode.js';
import {
    mergeShipmentSummaries,
    normalizeShipmentDetail,
    normalizeShipmentListResponse,
    paginateShipmentSummaries,
} from './shipmentNormalize.js';

async function fetchThaiNexusShipmentList(
    token: string,
    page: number,
    limit: number
): Promise<ShipmentListResponse> {
    try {
        const response = await shipmentCrud(token, 'list', {
            data: { page, limit },
        });

        return normalizeShipmentListResponse(response);
    } catch (nestedError) {
        const response = await shipmentCrud(token, 'list', { page, limit });

        try {
            return normalizeShipmentListResponse(response);
        } catch (flatError) {
            throw nestedError instanceof Error ? nestedError : flatError;
        }
    }
}

export async function listShipments(
    instanceId: string,
    page = 1,
    limit = 10
): Promise<ShipmentListResponse> {
    const token = await getApiToken(instanceId);
    if (!token) {
        throw new Error('Thai Nexus API token is not configured');
    }

    return fetchThaiNexusShipmentList(token, page, limit);
}

export type ShipmentListResult = ShipmentListResponse & {
    warning?: string;
    source?: 'thai_nexus' | 'local' | 'merged';
};

/**
 * List shipments for the merchant dashboard. Prefer Thai Nexus as source of truth,
 * merge in webhook-tracked request numbers from D1, and fall back locally when
 * the upstream list call fails.
 */
export async function listShipmentsForStore(
    instanceId: string,
    page = 1,
    limit = 10
): Promise<ShipmentListResult> {
    const token = await getApiToken(instanceId);
    if (!token) {
        throw new Error('Thai Nexus API token is not configured');
    }

    const localRows = await listStoredOrderShipments(instanceId);
    let upstreamRows: ShipmentSummary[] = [];
    let upstreamError: string | null = null;

    try {
        const upstream = await fetchThaiNexusShipmentList(token, 1, 250);
        upstreamRows = upstream.data || [];
    } catch (err) {
        upstreamError = err instanceof Error ? err.message : 'Thai Nexus shipment list failed';
    }

    const merged = mergeShipmentSummaries(upstreamRows, localRows);
    const paginated = paginateShipmentSummaries(merged, page, limit);

    if (!merged.length && upstreamError) {
        throw new Error(upstreamError);
    }

    if (!merged.length) {
        return { ...paginated, source: 'thai_nexus' };
    }

    if (upstreamError) {
        return {
            ...paginated,
            source: 'local',
            warning: `Thai Nexus list is temporarily unavailable (${upstreamError}). Showing shipments created from Wix orders.`,
        };
    }

    if (merged.length > upstreamRows.length) {
        return {
            ...paginated,
            source: 'merged',
            warning:
                'Some shipments were added from recent Wix orders while Thai Nexus sync catches up.',
        };
    }

    return {
        ...paginated,
        source: upstreamRows.length ? 'thai_nexus' : 'local',
    };
}

export async function getShipment(
    instanceId: string,
    requestNumber: string
): Promise<ShipmentDetail> {
    const token = await getApiToken(instanceId);
    if (!token) {
        throw new Error('Thai Nexus API token is not configured');
    }

    try {
        const response = await shipmentCrud(token, 'get', {
            data: { request_number: requestNumber },
        });

        return normalizeShipmentDetail(response.data ?? response);
    } catch {
        const response = await shipmentCrud(token, 'get', {
            request_number: requestNumber,
        });

        return normalizeShipmentDetail(response.data ?? response);
    }
}

export interface CreateOrderShipmentsInput {
    instanceId: string;
    orderId: string | number;
    shipper: ShipperProfile;
    consignee: {
        name: string;
        phone: string;
        email?: string;
        street: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
    };
    items: BcRateItem[];
    boxes: ShippingBox[];
    documentFlags?: Record<string, boolean>;
    boxedProductFlags?: Record<string, boolean>;
    /** Thai Nexus service id from checkout, e.g. prime_ddp. */
    serviceId?: string;
    /** Resume after a partial webhook run - skip boxes already created. */
    startBoxIndex?: number;
}

function cleanAddress(addr: {
    name?: string;
    phone?: string;
    email?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}) {
    const s = (v?: string) => (v ?? '').toString().trim();
    const email = s(addr.email);
    const looksLikeEmail = email.includes('@') && email.includes('.');

    return {
        name: s(addr.name) || 'Customer',
        phone: s(addr.phone) || '0000000000',
        ...(looksLikeEmail ? { email } : {}),
        address_line1: s(addr.street) || 'N/A',
        city: s(addr.city),
        state: s(addr.state),
        postal_code: s(addr.postalCode),
        country: s(addr.country) || 'TH',
    };
}

export async function fillMissingItemHsCodes(
    items: BcRateItem[],
    destinationCountry?: string,
    suggest: (description: string, country?: string) => Promise<string> = apiSuggestHsCode
): Promise<BcRateItem[]> {
    const missingNames = [
        ...new Set(
            items
                .filter((item) => !normalizeHsCode(item.hs_code))
                .map((item) => (item.name || '').trim())
                .filter((name) => name.length >= 2)
        ),
    ].slice(0, 8);

    const suggested = new Map<string, string>();
    await Promise.all(
        missingNames.map(async (name) => {
            try {
                suggested.set(name, await suggest(name, destinationCountry));
            } catch {
                suggested.set(name, '');
            }
        })
    );

    return items.map((item) => {
        const hs =
            normalizeHsCode(item.hs_code) ||
            suggested.get((item.name || '').trim()) ||
            '';
        return hs ? { ...item, hs_code: hs } : item;
    });
}

/**
 * Create one Thai Nexus shipment per packed box for a Wix order.
 *
 * Resilient by design: a failure on box N does NOT discard the boxes already
 * created (which would orphan them and cause duplicates on webhook retry). We
 * return whatever succeeded plus a list of non-fatal errors so the caller can
 * persist progress and the idempotency guard trips on the next delivery.
 */
export async function createShipmentsForOrder(
    input: CreateOrderShipmentsInput
): Promise<{
    created: Array<{ request_number: string; status?: string; id?: string | number }>;
    packedBoxes: Array<{ length: number; width: number; height: number; weight: number }>;
    errors: string[];
    expectedBoxCount: number;
}> {
    const token = await getApiToken(input.instanceId);
    if (!token) {
        throw new Error('Thai Nexus API token is not configured');
    }

    const items = await fillMissingItemHsCodes(input.items, input.consignee.country);
    const packing = packItems(items, input.boxes, input.documentFlags || {}, {
        boxedProductFlags: input.boxedProductFlags || {},
    });
    if (!packing.boxes.length) {
        throw new Error(packing.errors[0] || 'Could not pack order items');
    }

    const shipperAddress = cleanAddress(input.shipper);
    const consigneeAddress = cleanAddress(input.consignee);
    const created: Array<{ request_number: string; status?: string; id?: string | number }> =
        [];
    // Carry forward packing warnings (e.g. "missing dimensions - using defaults").
    const errors: string[] = [...packing.errors];

    const startBoxIndex = Math.max(0, input.startBoxIndex ?? 0);
    const serviceId = input.serviceId?.trim();

    for (let index = startBoxIndex; index < packing.boxes.length; index++) {
        const box = packing.boxes[index];

        try {
            // PackedBox contract: dims are the chosen box's inner dims and
            // weight includes the empty box - matching the parcel the courier
            // collects, and matching what the checkout rate was quoted on.
            const shipmentItems = box.shipmentItems || [];
            const declaredTotal = totalDeclaredValue(shipmentItems);
            const response = await shipmentCrud(token, 'create', {
                data: {
                    shipper_address: shipperAddress,
                    consignee_address: consigneeAddress,
                    actual_weight_kg: box.weight,
                    length_cm: box.length,
                    width_cm: box.width,
                    height_cm: box.height,
                    is_document: box.isDocument,
                    shipment_type: 'parcel',
                    ...(serviceId
                        ? {
                              service_id: serviceId,
                              service_type: serviceId,
                          }
                        : {}),
                    shipment_items: shipmentItems,
                    total_declared_value: declaredTotal,
                    total_currency: shipmentItems[0]?.currency_code || 'THB',
                    shipment_description: `Wix Order #${input.orderId} - Box ${index + 1}/${packing.boxes.length} (${box.boxName})`,
                },
            });

            const row = (response.data || response) as {
                request_number?: string;
                status?: string;
                id?: string | number;
            };

            if (row.request_number) {
                created.push({
                    request_number: row.request_number,
                    status: row.status,
                    id: row.id,
                });
            } else {
                errors.push(`Box ${index + 1}: Thai Nexus did not return a request_number`);
            }
        } catch (err) {
            errors.push(
                `Box ${index + 1}: ${err instanceof Error ? err.message : 'shipment create failed'}`
            );
        }
    }

    return {
        created,
        packedBoxes: packing.boxes.map((b) => ({
            length: b.length,
            width: b.width,
            height: b.height,
            weight: b.weight,
            items: b.items,
        })),
        errors,
        expectedBoxCount: packing.boxes.length,
    };
}

export type { ShipmentSummary };
