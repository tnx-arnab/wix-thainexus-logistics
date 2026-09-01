import {
    apiShippingServices,
    createShipmentsForOrder,
    getApiToken,
    getConfig,
    getOrderShipments,
    getStore,
    isOrderShipmentRecordComplete,
    mergeShippingEligibleFlags,
    normalizeServiceId,
    rateItemCatalogIds,
    resolveProductFlagMap,
    resolveShipmentServiceId,
    saveOrderShipments,
    type BcRateItem,
    type OrderShipmentRecord,
    type ThaiNexusShippingService,
} from '@thai-nexus/shared';
import { resolveProductPhysicalMap } from './productPhysical.js';
import { pickMergedPhysical, spiLineCatalogKeys, spiLinePrimaryProductId } from './spiCatalog.js';
import { getValidAccessToken } from './tokens.js';
import {
    lineDisplayName,
    lineHsCode,
    lineOriginCountry,
    lineUnitDeclaredValue,
    lineUnitPriceAmount,
} from './wixShippingDestination.js';

function orderFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
    return (
        (payload.order as Record<string, unknown>) ||
        ((payload.data as Record<string, unknown>)?.order as Record<string, unknown>) ||
        payload
    );
}

function paymentStatusFromPayload(payload: Record<string, unknown>): string {
    const order = orderFromPayload(payload);
    const raw =
        (order.paymentStatus as string) ||
        (order.payment_status as string) ||
        (payload.paymentStatus as string);
    return raw ? String(raw).toUpperCase() : '';
}

function webhookSlug(body: Record<string, unknown>): string {
    return String(body.slug || body.eventType || '').toLowerCase();
}

const BLOCKED_PAYMENT_FOR_SHIPMENT = new Set([
    'CANCELED',
    'DECLINED',
    'FULLY_REFUNDED',
]);

function isOrderCreatedWebhook(slug: string): boolean {
    if (slug === 'created' || slug.endsWith('.created')) return true;
    if (slug.includes('order_created') || slug.includes('order-created')) return true;
    if (slug.includes('wix.ecom.v1.order_created')) return true;
    return false;
}

/**
 * Unwrap Wix JWT webhook bodies (payment status updated, order created, legacy order paid).
 * Returns skipReason when the event should not create shipments.
 */
export function normalizeOrderWebhookBody(body: Record<string, unknown>): {
    payload: Record<string, unknown>;
    skipReason?: string;
} {
    let payload: Record<string, unknown> = body;
    const actionEvent = body.actionEvent as Record<string, unknown> | undefined;
    if (actionEvent?.body && typeof actionEvent.body === 'object') {
        payload = actionEvent.body as Record<string, unknown>;
    }

    const createdEvent = body.createdEvent as { entity?: Record<string, unknown> } | undefined;
    if (createdEvent?.entity && typeof createdEvent.entity === 'object') {
        payload = { order: createdEvent.entity };
    }

    const slug = webhookSlug(body);
    const hasCreatedEntity = Boolean(
        (body.createdEvent as { entity?: unknown } | undefined)?.entity
    );
    const isPaymentStatusEvent =
        slug.includes('payment_status') || slug.includes('payment-status');
    const isCreatedEvent = isOrderCreatedWebhook(slug) || hasCreatedEntity;

    const status = paymentStatusFromPayload(payload);

    if (isPaymentStatusEvent) {
        if (status !== 'PAID') {
            return { payload, skipReason: status ? 'not-paid' : 'missing-payment-status' };
        }
    } else if (isCreatedEvent) {
        if (status && BLOCKED_PAYMENT_FOR_SHIPMENT.has(status)) {
            return { payload, skipReason: `blocked-${status.toLowerCase()}` };
        }
    } else if (status && status !== 'PAID') {
        return { payload, skipReason: 'not-paid' };
    } else if (!status) {
        const paidSlug =
            slug.includes('paid') ||
            slug.includes('order_paid') ||
            slug.includes('order_approved') ||
            slug.includes('order-approved');
        if (!paidSlug) {
            return { payload, skipReason: 'missing-payment-status' };
        }
    }

    if (payload.order && typeof payload.order === 'object') {
        return { payload };
    }

    const order = orderFromPayload(payload);
    if (order !== payload && order.id != null) {
        return { payload: { ...payload, order } };
    }

    return { payload };
}

function textIncludesThaiNexus(value: string | undefined): boolean {
    if (!value) return false;
    const v = value.toLowerCase();
    return v.includes('thai nexus') || v.includes('thainexus');
}

const TN_SPI_RATE_CODES = new Set(['prime_ddp', 'priority_ddp', 'flex_dap']);

function isThaiNexusRateCode(code: string | undefined): boolean {
    if (!code?.trim()) return false;
    const n = normalizeServiceId(code);
    if (TN_SPI_RATE_CODES.has(n)) return true;
    if (n.startsWith('thainexus_')) return true;
    return n.endsWith('_ddp') || n.endsWith('_dap');
}

async function isThaiNexusShippingMethod(
    instanceId: string,
    methodTitle: string | undefined,
    methodCode: string | undefined,
    carrierId?: string,
    services?: ThaiNexusShippingService[]
): Promise<boolean> {
    const appId = process.env.WIX_APP_ID?.trim();
    if (appId && carrierId && carrierId === appId) return true;

    if (isThaiNexusRateCode(methodCode)) return true;
    if (textIncludesThaiNexus(methodTitle) || textIncludesThaiNexus(methodCode)) {
        return true;
    }

    const listed = services ?? (await loadShippingServices(instanceId));
    const names = listed.map((s) => normalizeServiceId(s.service_name || s.id || ''));
    const candidates = [methodTitle, methodCode]
        .filter(Boolean)
        .map((v) => normalizeServiceId(String(v)));
    return candidates.some((c) => names.some((n) => n && (c.includes(n) || n.includes(c))));
}

async function loadShippingServices(instanceId: string): Promise<ThaiNexusShippingService[]> {
    const token = await getApiToken(instanceId);
    if (!token) return [];

    try {
        const services = await apiShippingServices(token);
        return services.data || [];
    } catch {
        return [];
    }
}

function extractOrderId(payload: Record<string, unknown>): string | null {
    const order =
        (payload.order as Record<string, unknown>) ||
        ((payload.data as Record<string, unknown>)?.order as Record<string, unknown>) ||
        payload;
    const id =
        (order as { id?: string | number })?.id ||
        (order as { _id?: string })?._id ||
        payload.orderId;
    return id != null ? String(id) : null;
}

export function extractShippingMethod(payload: Record<string, unknown>): {
    title?: string;
    code?: string;
    carrierId?: string;
} {
    const order = orderFromPayload(payload);

    const shippingInfo =
        (order.shippingInfo as Record<string, unknown>) ||
        (order.shipping_info as Record<string, unknown>) ||
        {};
    const carrier =
        (shippingInfo.carrier as Record<string, unknown>) ||
        (shippingInfo.selectedCarrierServiceOption as Record<string, unknown>) ||
        {};
    const logistics = (shippingInfo.logistics as Record<string, unknown>) || {};

    const title = String(
        carrier.title || carrier.name || shippingInfo.title || logistics.title || ''
    ).trim();
    const code = String(carrier.code || shippingInfo.code || logistics.code || '').trim();

    return {
        title: title || undefined,
        code: code || undefined,
        carrierId: String(
            shippingInfo.carrierId || carrier.carrierId || shippingInfo.carrier_id || ''
        ).trim() || undefined,
    };
}

export function mapOrderLineItems(payload: Record<string, unknown>): BcRateItem[] {
    const order =
        (payload.order as Record<string, unknown>) ||
        ((payload.data as Record<string, unknown>)?.order as Record<string, unknown>) ||
        payload;
    const lines =
        (order.lineItems as Array<Record<string, unknown>>) ||
        (order.line_items as Array<Record<string, unknown>>) ||
        [];

    return lines.map((line, idx) => {
        const catalog = (line.catalogReference as Record<string, unknown>) || {};
        const phys = (line.physicalProperties as Record<string, unknown>) || {};
        const catalogKeys = spiLineCatalogKeys({
            catalogReference: catalog as { catalogItemId?: string; options?: Record<string, unknown> },
            physicalProperties: phys as { sku?: string },
        });
        const productId = spiLinePrimaryProductId(
            {
                catalogReference: catalog as { catalogItemId?: string; options?: Record<string, unknown> },
                physicalProperties: phys as { sku?: string },
            },
            (line.productId as string) || (line.id as string) || `line_${idx}`
        );

        const qty = Number(line.quantity) || 1;
        const unitValue = lineUnitDeclaredValue(line);
        const currency = String(
            (line.price as { currency?: string } | undefined)?.currency ||
                (line.totalPrice as { currency?: string } | undefined)?.currency ||
                'THB'
        ).toUpperCase();

        return {
            product_id: String(productId),
            catalog_lookup_ids: catalogKeys.length ? catalogKeys : undefined,
            name: lineDisplayName(line) || `Item ${idx + 1}`,
            quantity: qty,
            length: { units: 'cm', value: Number(phys.length || line.length) || 0 },
            width: { units: 'cm', value: Number(phys.width || line.width) || 0 },
            height: { units: 'cm', value: Number(phys.height || line.height) || 0 },
            weight: { units: 'kg', value: Number(phys.weight || line.weight) || 0 },
            discounted_price: {
                currency: currency || 'THB',
                amount: String(unitValue || lineUnitPriceAmount(line) || '0'),
            },
            hs_code: lineHsCode(line) || undefined,
            country_of_origin: lineOriginCountry(line, 'TH'),
        };
    });
}

function extractConsignee(payload: Record<string, unknown>) {
    const order =
        (payload.order as Record<string, unknown>) ||
        ((payload.data as Record<string, unknown>)?.order as Record<string, unknown>) ||
        payload;
    const shippingInfo = (order.shippingInfo as Record<string, unknown>) || {};
    const logistics = (shippingInfo.logistics as Record<string, unknown>) || {};
    const addr =
        (logistics.shippingDestination as Record<string, unknown>) ||
        (order.recipientInfo as Record<string, unknown>) ||
        (order.billingInfo as Record<string, unknown>) ||
        {};
    const address = (addr.address as Record<string, unknown>) || addr;
    const contact = (addr.contactDetails as Record<string, unknown>) || addr;

    return {
        name: String(
            contact.fullName ||
                [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
                addr.name ||
                'Customer'
        ),
        phone: String(contact.phone || addr.phone || ''),
        street: String(address.addressLine || address.street || ''),
        city: String(address.city || ''),
        state: String(address.subdivision || address.state || ''),
        postalCode: String(address.postalCode || ''),
        country: String(address.country || 'TH'),
    };
}

/**
 * Process Wix order paid/created webhook. Always returns a reason code for logging.
 * Caller must respond HTTP 200.
 */
export async function processOrderWebhook(
    instanceId: string,
    payload: Record<string, unknown>
): Promise<{ ok: boolean; reason: string }> {
    const orderId = extractOrderId(payload);
    if (!orderId) {
        return { ok: false, reason: 'missing-order-id' };
    }

    let shipmentRecord = await getOrderShipments(instanceId, orderId);
    if (shipmentRecord && isOrderShipmentRecordComplete(shipmentRecord)) {
        return { ok: false, reason: 'already-created' };
    }
    if (shipmentRecord && shipmentRecord.complete === false) {
        const createdMs = shipmentRecord.createdAt ? Date.parse(shipmentRecord.createdAt) : 0;
        const ageMs = createdMs ? Date.now() - createdMs : 0;
        const pending =
            (shipmentRecord.requestNumbers?.length ?? 0) === 0 &&
            ageMs >= 0 &&
            ageMs < 120_000;
        if (pending) {
            return { ok: false, reason: 'processing' };
        }
    }

    if (!shipmentRecord) {
        await saveOrderShipments({
            orderId: String(orderId),
            instanceId,
            requestNumbers: [],
            shipments: [],
            complete: false,
            expectedBoxCount: 0,
            createdAt: new Date().toISOString(),
        });
        shipmentRecord = await getOrderShipments(instanceId, orderId);
    }

    if (shipmentRecord && isOrderShipmentRecordComplete(shipmentRecord)) {
        return { ok: false, reason: 'already-created' };
    }

    const token = await getApiToken(instanceId);
    if (!token) {
        return { ok: false, reason: 'no-token' };
    }

    const config = await getConfig(instanceId);
    if (!config) {
        return { ok: false, reason: 'store-not-ready' };
    }

    const method = extractShippingMethod(payload);
    const services = await loadShippingServices(instanceId);
    if (
        !(await isThaiNexusShippingMethod(
            instanceId,
            method.title,
            method.code,
            method.carrierId,
            services
        ))
    ) {
        return { ok: false, reason: 'not-thai-nexus-method' };
    }

    const serviceId = resolveShipmentServiceId(method.code, method.title, services);

    let items = mapOrderLineItems(payload);
    const productIds = [
        ...new Set(items.flatMap((i) => rateItemCatalogIds(i)).filter(Boolean)),
    ];

    try {
        const accessToken = await getValidAccessToken(instanceId);
        const store = await getStore(instanceId);
        if (accessToken && productIds.length) {
            const physical = await resolveProductPhysicalMap(
                instanceId,
                accessToken,
                productIds,
                store?.site_id
            );
            items = items.map((item) => {
                const p = pickMergedPhysical(physical, rateItemCatalogIds(item));
                if (!p) return item;
                return {
                    ...item,
                    weight: {
                        units: 'kg',
                        value:
                            item.weight?.value && item.weight.value > 0
                                ? item.weight.value
                                : p.weightKg || 0,
                    },
                    length: {
                        units: 'cm',
                        value:
                            item.length?.value && item.length.value > 0
                                ? item.length.value
                                : p.lengthCm || 0,
                    },
                    width: {
                        units: 'cm',
                        value:
                            item.width?.value && item.width.value > 0
                                ? item.width.value
                                : p.widthCm || 0,
                    },
                    height: {
                        units: 'cm',
                        value:
                            item.height?.value && item.height.value > 0
                                ? item.height.value
                                : p.heightCm || 0,
                    },
                };
            });
        }
    } catch (err) {
        console.warn(
            '[order-webhook] catalog enrich skipped',
            err instanceof Error ? err.message : err
        );
    }

    const [documentFlags, boxedFlags, eligibleFlags] = await Promise.all([
        resolveProductFlagMap(instanceId, productIds, 'is_document'),
        resolveProductFlagMap(instanceId, productIds, 'is_boxed'),
        resolveProductFlagMap(instanceId, productIds, 'shipping_eligible'),
    ]);

    const mergedEligible = mergeShippingEligibleFlags(
        eligibleFlags,
        config.shippingIneligibleProductIds
    );
    if (items.some((i) => rateItemCatalogIds(i).some((id) => mergedEligible[id] === false))) {
        return { ok: false, reason: 'ineligible-products' };
    }

    const startBoxIndex = shipmentRecord?.requestNumbers?.length || 0;

    try {
        const result = await createShipmentsForOrder({
            instanceId,
            orderId,
            shipper: config.shipper,
            consignee: extractConsignee(payload),
            items,
            boxes: config.boxes || [],
            documentFlags,
            boxedProductFlags: boxedFlags,
            serviceId,
            startBoxIndex,
        });

        const requestNumbers = [
            ...(shipmentRecord?.requestNumbers || []),
            ...result.created.map((c) => c.request_number),
        ];
        const shipments = [
            ...(shipmentRecord?.shipments || []),
            ...result.created,
        ];
        const complete =
            requestNumbers.length >= result.expectedBoxCount && result.errors.length === 0;

        const record: OrderShipmentRecord = {
            orderId,
            instanceId,
            requestNumbers,
            shipments,
            packedBoxes: result.packedBoxes,
            errors: [...(shipmentRecord?.errors || []), ...result.errors],
            expectedBoxCount: result.expectedBoxCount,
            complete,
            createdAt: shipmentRecord?.createdAt || new Date().toISOString(),
        };
        await saveOrderShipments(record);

        return {
            ok: complete,
            reason: complete ? 'created' : result.errors.length ? 'partial' : 'created',
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'shipment-create-failed';
        return { ok: false, reason: message };
    }
}
