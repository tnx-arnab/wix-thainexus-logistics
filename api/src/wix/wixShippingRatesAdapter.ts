import {
    BcRateRequest,
    BcRateResponse,
    CARRIER_CODE,
    calculateRates,
    getStore,
    rateItemCatalogIds,
    resolveProductFlagMap,
    type CalculateRatesOptions,
} from '@thai-nexus/shared';
import { fetchWixProductPhysicalMap } from './catalog.js';
import { resolveProductPhysicalMap } from './productPhysical.js';
import { pickMergedPhysical, spiLineCatalogKeys, spiLinePrimaryProductId } from './spiCatalog.js';
import { getValidAccessToken } from './tokens.js';

export type WixShippingRateOption = {
    code: string;
    title: string;
    logistics?: { deliveryTime?: string; instructions?: string };
    cost: {
        price: string;
        currency: string;
        additionalCharges?: Array<{
            price: string;
            type?: string;
            details?: string;
        }>;
    };
};

export type WixGetShippingRatesRequest = {
    lineItems?: Array<{
        name?: string;
        quantity?: number;
        price?: string;
        totalPrice?: string;
        catalogReference?: {
            catalogItemId?: string;
            appId?: string;
            options?: Record<string, unknown>;
        };
        physicalProperties?: {
            weight?: number;
            sku?: string;
            shippable?: boolean;
            length?: number;
            width?: number;
            height?: number;
        };
        length?: number;
        width?: number;
        height?: number;
        weight?: number;
    }>;
    shippingDestination?: {
        country?: string;
        subdivision?: string;
        city?: string;
        postalCode?: string;
        addressLine?: string;
        addressLine2?: string;
    };
    weightUnit?: string;
    taxIncludedInPrices?: boolean;
};

export type WixShippingMetadata = {
    instanceId?: string;
    currency?: string;
    requestId?: string;
    languages?: string[];
};

function lbToKg(lb: number): number {
    return lb * 0.45359237;
}

function toKg(weight: number | undefined, unit?: string): number {
    if (weight == null || !Number.isFinite(weight)) return 0;
    const u = (unit || 'KG').toUpperCase();
    if (u === 'LB' || u === 'LBS' || u === 'POUND' || u === 'POUNDS') {
        return lbToKg(weight);
    }
    return weight;
}

function subdivisionState(subdivision?: string): string {
    if (!subdivision) return '';
    const parts = subdivision.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : subdivision;
}

function money2(n: number): string {
    return (Math.round(n * 100) / 100).toFixed(2);
}

/** Map Wix SPI request → internal RateRequest (BC-shaped DTO). */
export function wixRequestToRateRequest(
    request: WixGetShippingRatesRequest,
    metadata: WixShippingMetadata
): BcRateRequest {
    const dest = request.shippingDestination || {};
    const currency = metadata.currency || 'THB';
    const weightUnit = request.weightUnit || 'KG';

    const items = (request.lineItems || []).map((line, idx) => {
        const phys = line.physicalProperties || {};
        const weight = toKg(line.weight ?? phys.weight, weightUnit);
        const length = Number(line.length ?? phys.length) || 0;
        const width = Number(line.width ?? phys.width) || 0;
        const height = Number(line.height ?? phys.height) || 0;
        const unitPrice = line.price || '0';
        const catalogKeys = spiLineCatalogKeys(line);
        const productId = spiLinePrimaryProductId(line, phys.sku || `line_${idx}`);

        return {
            product_id: String(productId),
            catalog_lookup_ids: catalogKeys.length ? catalogKeys : undefined,
            name: line.name || `Item ${idx + 1}`,
            quantity: line.quantity || 1,
            length: { units: 'cm', value: length },
            width: { units: 'cm', value: width },
            height: { units: 'cm', value: height },
            weight: { units: 'kg', value: weight },
            discounted_price: { currency, amount: String(unitPrice) },
        };
    });

    return {
        base_options: {
            store_id: metadata.instanceId || '',
            currency_code: currency,
            destination: {
                street_1: dest.addressLine,
                zip: dest.postalCode,
                city: dest.city,
                state_iso2: subdivisionState(dest.subdivision),
                country_iso2: dest.country,
            },
            items,
        },
    };
}

/** Fill missing weight/dims from Wix Stores catalog (SPI often omits dims). */
export async function enrichRateRequestFromCatalog(
    rateRequest: BcRateRequest,
    accessToken: string | null,
    instanceId?: string | null,
    siteId?: string | null
): Promise<BcRateRequest> {
    if (!accessToken) return rateRequest;

    const items = rateRequest.base_options.items || [];
    const needs = items.filter((item) => {
        const missingWeight = !(item.weight?.value && item.weight.value > 0);
        const missingDims =
            !(item.length?.value && item.length.value > 0) ||
            !(item.width?.value && item.width.value > 0) ||
            !(item.height?.value && item.height.value > 0);
        return rateItemCatalogIds(item).length > 0 && (missingWeight || missingDims);
    });

    if (!needs.length) return rateRequest;

    const ids = [...new Set(needs.flatMap((i) => rateItemCatalogIds(i)))];
    const physical =
        instanceId != null && instanceId !== ''
            ? await resolveProductPhysicalMap(instanceId, accessToken, ids, siteId)
            : await fetchWixProductPhysicalMap(accessToken, ids, siteId);

    return {
        ...rateRequest,
        base_options: {
            ...rateRequest.base_options,
            items: items.map((item) => {
                const lookupKeys = rateItemCatalogIds(item);
                const p = pickMergedPhysical(physical, lookupKeys);
                if (!p) return item;

                return {
                    ...item,
                    name: item.name || p.name || item.name,
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
            }),
        },
    };
}

/** Map internal quotes → Wix SPI shippingRates[]. */
export function rateResponseToWix(
    response: BcRateResponse,
    currency: string
): { shippingRates: WixShippingRateOption[] } {
    const quotes = response.carrier_quotes?.flatMap((c) => c.quotes || []) || [];

    const shippingRates: WixShippingRateOption[] = quotes.map((q) => {
        const codeBase = String(q.code || q.rate_id || q.display_name || 'express')
            .replace(/\s+/g, '_')
            .toLowerCase();
        const code = codeBase.includes(CARRIER_CODE)
            ? codeBase
            : `${CARRIER_CODE}_${codeBase}`;

        return {
            code,
            title: q.display_name || 'Thai Nexus Express',
            logistics: {
                deliveryTime:
                    q.transit_time?.duration != null
                        ? `${q.transit_time.duration} ${String(q.transit_time.units || 'DAYS').toLowerCase()}`
                        : undefined,
            },
            cost: {
                price: money2(Number(q.cost?.amount) || 0),
                currency: q.cost?.currency || currency || 'THB',
            },
        };
    });

    return { shippingRates };
}

function firstRateMessage(response: BcRateResponse): string | undefined {
    const msg = response.messages?.find((m) => m.text?.trim());
    return msg?.text?.trim();
}

export async function calculateWixShippingRates(
    request: WixGetShippingRatesRequest,
    metadata: WixShippingMetadata
): Promise<{ shippingRates: WixShippingRateOption[]; hint?: string }> {
    const instanceId = metadata.instanceId;
    if (!instanceId) {
        return { shippingRates: [], hint: 'missing-instance-id-in-spi-jwt' };
    }

    let rateRequest = wixRequestToRateRequest(request, metadata);

    try {
        const accessToken = await getValidAccessToken(instanceId);
        const store = await getStore(instanceId);
        rateRequest = await enrichRateRequestFromCatalog(
            rateRequest,
            accessToken,
            instanceId,
            store?.site_id
        );
    } catch (err) {
        console.warn(
            '[getShippingRates] catalog enrich skipped',
            err instanceof Error ? err.message : err
        );
    }

    const options: CalculateRatesOptions = {
        resolveDocumentFlags: async (ids) =>
            resolveProductFlagMap(instanceId, ids, 'is_document'),
        resolveBoxedProductFlags: async (ids) =>
            resolveProductFlagMap(instanceId, ids, 'is_boxed'),
        resolveShippingEligibleFlags: async (ids) =>
            resolveProductFlagMap(instanceId, ids, 'shipping_eligible'),
    };

    try {
        const result = await calculateRates(rateRequest, options);
        const shippingRates = rateResponseToWix(result, metadata.currency || 'THB').shippingRates;
        const hint =
            shippingRates.length === 0 ? firstRateMessage(result) : undefined;
        return { shippingRates, hint };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
            '[getShippingRates]',
            instanceId,
            message
        );
        return { shippingRates: [], hint: message };
    }
}
