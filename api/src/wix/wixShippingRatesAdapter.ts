import {
    BcRateRequest,
    BcRateResponse,
    calculateRates,
    formatServiceDisplayName,
    getStore,
    normalizeServiceId,
    rateItemCatalogIds,
    resolveProductFlagMap,
    type BcCarrierQuote,
    type CalculateRatesOptions,
} from '@thai-nexus/shared';
import { fetchWixProductPhysicalMap } from './catalog.js';
import { resolveProductPhysicalMap } from './productPhysical.js';
import { pickMergedPhysical, spiLineCatalogKeys, spiLinePrimaryProductId } from './spiCatalog.js';
import {
    lineDisplayName,
    lineUnitPriceAmount,
    normalizeWixShippingDestination,
} from './wixShippingDestination.js';
import { getValidAccessToken } from './tokens.js';
import {
    getSpiCheckoutCache,
    getInstanceSpiFallback,
    setSpiCheckoutCache,
    spiCheckoutCacheKey,
} from './spiCheckoutCache.js';
import { deferWebhookWork } from '../workerContext.js';

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
        productName?: { original?: string; translated?: string };
        quantity?: number;
        price?: string | { amount?: string };
        totalPrice?: string | { amount?: string };
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
    shippingDestination?: Record<string, unknown>;
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
    const dest = normalizeWixShippingDestination(request.shippingDestination);
    const currency = metadata.currency || 'THB';
    const weightUnit = request.weightUnit || 'KG';

    const shippableLines = (request.lineItems || []).filter(
        (line) => line.physicalProperties?.shippable !== false
    );

    const items = shippableLines.map((line, idx) => {
        const phys = line.physicalProperties || {};
        const weight = toKg(line.weight ?? phys.weight, weightUnit);
        const length = Number(line.length ?? phys.length) || 0;
        const width = Number(line.width ?? phys.width) || 0;
        const height = Number(line.height ?? phys.height) || 0;
        const unitPrice = lineUnitPriceAmount(line as Record<string, unknown>);
        const catalogKeys = spiLineCatalogKeys(line);
        const productId = spiLinePrimaryProductId(line, phys.sku || `line_${idx}`);

        return {
            product_id: String(productId),
            catalog_lookup_ids: catalogKeys.length ? catalogKeys : undefined,
            name: lineDisplayName(line as Record<string, unknown>) || `Item ${idx + 1}`,
            quantity: line.quantity || 1,
            length: { units: 'cm', value: length },
            width: { units: 'cm', value: width },
            height: { units: 'cm', value: height },
            weight: { units: 'kg', value: weight },
            discounted_price: { currency, amount: unitPrice },
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

function formatDeliveryTimeForWix(q: BcCarrierQuote): string | undefined {
    if (q.description?.trim()) {
        return q.description.trim();
    }
    const t = q.transit_time;
    if (t?.duration == null) return undefined;
    const n = t.duration;
    const units = String(t.units || 'BUSINESS_DAYS').toUpperCase();
    if (units === 'HOURS') {
        return n === 1 ? '1 hour' : `${n} hours`;
    }
    if (units === 'DAYS' || units === 'BUSINESS_DAYS') {
        return n === 1 ? '1 business day' : `${n} business days`;
    }
    return `${n} ${units.toLowerCase().replace(/_/g, ' ')}`;
}

/** Stable SPI code = Thai Nexus courier slug (must match delivery profile from same getRates response). */
function wixShippingRateCode(q: BcCarrierQuote): string {
    if (q.code?.trim()) {
        return normalizeServiceId(q.code).replace(/[^a-z0-9_-]+/g, '_');
    }
    const fromRateId = q.rate_id?.match(
        /^tn_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/i
    )?.[1];
    if (fromRateId) {
        return fromRateId.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    }
    const slug = String(q.display_name || 'express').replace(/\s+/g, '_').toLowerCase();
    return slug.replace(/[^a-z0-9_-]+/g, '_');
}

function dedupeAndSortWixRates(
    shippingRates: WixShippingRateOption[]
): WixShippingRateOption[] {
    const byCode = new Map<string, WixShippingRateOption>();
    for (const rate of shippingRates) {
        const existing = byCode.get(rate.code);
        if (!existing) {
            byCode.set(rate.code, rate);
            continue;
        }
        if (Number(rate.cost.price) < Number(existing.cost.price)) {
            byCode.set(rate.code, rate);
        }
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Map internal quotes → Wix SPI shippingRates[]. */
export function rateResponseToWix(
    response: BcRateResponse,
    currency: string
): { shippingRates: WixShippingRateOption[] } {
    const quotes = response.carrier_quotes?.flatMap((c) => c.quotes || []) || [];
    const siteCurrency = currency.toUpperCase();

    const shippingRates = dedupeAndSortWixRates(
        quotes.map((q) => {
            return {
                code: wixShippingRateCode(q),
                title: formatServiceDisplayName(q.display_name || ''),
                logistics: {
                    deliveryTime: formatDeliveryTimeForWix(q) || 'Standard delivery',
                },
                cost: {
                    price: money2(Number(q.cost?.amount) || 0),
                    currency: siteCurrency || q.cost?.currency || 'THB',
                },
            };
        })
    );

    return { shippingRates };
}

function firstRateMessage(response: BcRateResponse): string | undefined {
    const msg = response.messages?.find((m) => m.text?.trim());
    return msg?.text?.trim();
}

function spiDeadlineMs(): number | null {
    const raw = process.env.SPI_DEADLINE_MS?.trim();
    if (raw === '0' || raw?.toLowerCase() === 'off') return null;
    const n = raw ? Number(raw) : null;
    if (n == null || !Number.isFinite(n) || n <= 0) return null;
    return n;
}

async function withOptionalSpiDeadline<T>(work: Promise<T>): Promise<T> {
    const ms = spiDeadlineMs();
    if (!ms) return work;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`spi-deadline-${ms}ms`)), ms);
    });
    try {
        return await Promise.race([work, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function wixSpiFastMs(): number {
    const raw = process.env.WIX_SPI_FAST_MS?.trim();
    const n = raw ? Number(raw) : 8500;
    return Number.isFinite(n) && n >= 2000 ? n : 8500;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function computeLiveWixShippingRates(
    request: WixGetShippingRatesRequest,
    metadata: WixShippingMetadata,
    cacheKey: string
): Promise<{ shippingRates: WixShippingRateOption[]; hint?: string }> {
    const instanceId = metadata.instanceId!;
    let rateRequest = wixRequestToRateRequest(request, metadata);

    try {
        const [accessToken, store] = await Promise.all([
            getValidAccessToken(instanceId),
            getStore(instanceId),
        ]);
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
        const result = await withOptionalSpiDeadline(calculateRates(rateRequest, options));
        const siteCurrency =
            metadata.currency?.toUpperCase() ||
            rateRequest.base_options.currency_code?.toUpperCase() ||
            'THB';
        const { shippingRates } = rateResponseToWix(result, siteCurrency);
        const hint = shippingRates.length === 0 ? firstRateMessage(result) : undefined;

        const sorted = dedupeAndSortWixRates(shippingRates);
        if (sorted.length) {
            setSpiCheckoutCache(cacheKey, sorted);
            return { shippingRates: sorted, hint };
        }

        const cached = getSpiCheckoutCache(cacheKey);
        if (cached?.length) {
            return { shippingRates: cached, hint: hint || 'checkout-spi-cache-fallback' };
        }
        return { shippingRates: [], hint };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[getShippingRates]', instanceId, message);
        const cached = getSpiCheckoutCache(cacheKey) || getInstanceSpiFallback(instanceId);
        if (cached?.length) {
            return { shippingRates: cached, hint: message };
        }
        return { shippingRates: [], hint: message };
    }
}

export async function calculateWixShippingRates(
    request: WixGetShippingRatesRequest,
    metadata: WixShippingMetadata
): Promise<{ shippingRates: WixShippingRateOption[]; hint?: string }> {
    const instanceId = metadata.instanceId;
    if (!instanceId) {
        return { shippingRates: [], hint: 'missing-instance-id-in-spi-jwt' };
    }

    const cacheKey = spiCheckoutCacheKey(instanceId, request);
    const exactCache = getSpiCheckoutCache(cacheKey);
    if (exactCache?.length) {
        return { shippingRates: exactCache };
    }

    const live = computeLiveWixShippingRates(request, metadata, cacheKey);
    const fastMs = wixSpiFastMs();

    const raced = await Promise.race([
        live.then((r) => ({ kind: 'live' as const, ...r })),
        sleep(fastMs).then(() => ({ kind: 'timeout' as const })),
    ]);

    if (raced.kind === 'live') {
        return { shippingRates: raced.shippingRates, hint: raced.hint };
    }

    const fallback =
        getSpiCheckoutCache(cacheKey) ||
        getInstanceSpiFallback(instanceId) ||
        [];

    if (fallback.length) {
        deferWebhookWork(
            live.then((r) => {
                if (r.shippingRates.length) setSpiCheckoutCache(cacheKey, r.shippingRates);
            })
        );
        return {
            shippingRates: fallback,
            hint: raced.kind === 'timeout' ? 'spi-wix-fast-fallback' : undefined,
        };
    }

    const full = await live;
    return full;
}
