import { applyCheckoutPricing } from '../commission.js';
import { convertFromThb } from '../currency.js';
import { appendDebugLog, isDebugEnabled } from '../d1/debugLog.js';
import { packItems } from '../packing.js';
import { DebugApiCall, DebugFinalQuote, DebugLogBox, DebugLogProduct } from '../types/debug.js';
import {
    BcCarrierQuote,
    BcRateRequest,
    BcRateResponse,
    ThaiNexusQuote,
} from '../types/thaiNexus.js';
import { apiQuote, QuoteParams } from './client.js';
import {
    CARRIER_CODE,
    CARRIER_DISPLAY_NAME,
    classifyServiceLevel,
    dispatchDateIso,
    formatServiceDisplayName,
    normalizeServiceId,
    parseTransitDuration,
    parseZoneServiceLevels,
    quoteMatchesServiceLevels,
} from './shippingProvider.js';
import { mergeShippingEligibleFlags, rateItemCatalogIds, validateRateRequest } from '../rateEligibility.js';
import { filterCheckoutQuotes, quoteCoverageIds } from '../serviceCoverage.js';
import { getApiToken, getConfig } from './store.js';
import { sanitizeProductWeightUnit } from '../validation.js';

const CARRIER = { code: CARRIER_CODE, display_name: CARRIER_DISPLAY_NAME };

export type ProductFlagsResolver = (
    productIds: string[]
) => Promise<Record<string, boolean>>;

/** @deprecated Use ProductFlagsResolver */
export type DocumentFlagsResolver = ProductFlagsResolver;

export type CalculateRatesOptions = {
    resolveDocumentFlags?: ProductFlagsResolver;
    resolveShippingEligibleFlags?: ProductFlagsResolver;
    resolveBoxedProductFlags?: ProductFlagsResolver;
    /** BigCommerce connection_options.api_token - overrides stored token when set. */
    apiToken?: string | null;
    /** When false, apiQuote skips refresh=true (faster Wix checkout SPI). */
    refreshQuotes?: boolean;
};

function empty(message: string, type: 'ERROR' | 'WARNING' | 'INFO' = 'WARNING'): BcRateResponse {
    return {
        quote_id: `tn_${Date.now()}`,
        messages: [{ text: message, type }],
        carrier_quotes: [],
    };
}

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

function cartSubtotal(items: BcRateRequest['base_options']['items']): number {
    return items.reduce((sum, item) => {
        const p = parseFloat(item.discounted_price?.amount || '0');

        return sum + (Number.isFinite(p) ? p : 0) * (item.quantity || 1);
    }, 0);
}

function mergeQuotes(
    boxQuotes: ThaiNexusQuote[][]
): Record<string, { name: string; days: string | number; thb: number; count: number }> {
    const aggregated: Record<
        string,
        { name: string; days: string | number; thb: number; count: number }
    > = {};

    for (const quotes of boxQuotes) {
        const seenInBox = new Set<string>();

        for (const q of quotes) {
            const key = q.courier_name || q.display_name;
            if (seenInBox.has(key)) continue;
            seenInBox.add(key);

            if (!aggregated[key]) {
                aggregated[key] = {
                    name: q.display_name || key,
                    days: q.estimated_days ?? 'TBA',
                    thb: 0,
                    count: 0,
                };
            }
            aggregated[key].thb += Number(q.final_price_thb) || 0;
            aggregated[key].count += 1;
        }
    }

    return aggregated;
}

function quotePayload(params: QuoteParams): Record<string, unknown> {
    return {
        country: params.country,
        state: params.state,
        postcode: params.postcode,
        city: params.city,
        actual_weight_kg: params.actual_weight_kg,
        length_cm: params.length_cm,
        width_cm: params.width_cm,
        height_cm: params.height_cm,
        is_document: params.is_document,
    };
}

async function apiQuoteLive(
    _instanceId: string,
    params: QuoteParams,
    refreshQuotes = true
): Promise<{ quotes: ThaiNexusQuote[]; apiCall: DebugApiCall }> {
    const payload = quotePayload(params);
    const response = await apiQuote({ ...params, refresh: refreshQuotes });
    const quotes = response.quotes || [];

    return {
        quotes,
        apiCall: {
            endpoint: 'apiQuote',
            status: 200,
            payload: { ...payload, api_token: '[REDACTED]' },
            response,
            cached: false,
        },
    };
}

/** BC sends numeric values as strings ("15.0000"); render them as clean numbers. */
function cleanNum(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : undefined;
}

function buildDebugProducts(items: BcRateRequest['base_options']['items']): DebugLogProduct[] {
    return items.map((item, idx) => {
        const l = cleanNum(item.length?.value);
        const w = cleanNum(item.width?.value);
        const h = cleanNum(item.height?.value);
        const wt = cleanNum(item.weight?.value);

        return {
            id: item.product_id || String(idx),
            title: item.name || `Item ${idx + 1}`,
            qty: item.quantity || 1,
            dimensions: [l, w, h].filter((v) => v != null).length
                ? `${l ?? '?'}×${w ?? '?'}×${h ?? '?'} ${item.length?.units || 'cm'}`
                : 'defaults',
            weight: wt != null ? `${wt} ${item.weight?.units || 'kg'}` : 'default',
        };
    });
}

export async function calculateRates(
    body: BcRateRequest,
    options: CalculateRatesOptions = {}
): Promise<BcRateResponse> {
    const storeId = body.base_options?.store_id;
    const items = body.base_options?.items || [];
    const dest = body.base_options?.destination || {};
    if (!storeId) return empty('Missing store id');

    const config = await getConfig(storeId);
    if (config && config.enableCheckoutRates === false) {
        return empty('Thai Nexus checkout rates are turned off.', 'INFO');
    }
    const storedToken = await getApiToken(storeId);
    const token =
        options.apiToken?.trim() ||
        body.connection_options?.api_token?.trim() ||
        storedToken;

    const hasToken = Boolean(token);
    const productIds = [
        ...new Set(items.flatMap((i) => rateItemCatalogIds(i)).filter(Boolean)),
    ];

    const [documentFlags, shippingEligibleFlags, boxedProductFlags] = await Promise.all([
        options.resolveDocumentFlags && productIds.length
            ? options.resolveDocumentFlags(productIds)
            : Promise.resolve({} as Record<string, boolean>),
        options.resolveShippingEligibleFlags && productIds.length
            ? options.resolveShippingEligibleFlags(productIds)
            : Promise.resolve({} as Record<string, boolean>),
        options.resolveBoxedProductFlags && productIds.length
            ? options.resolveBoxedProductFlags(productIds)
            : Promise.resolve({} as Record<string, boolean>),
    ]);

    const eligibilityError = validateRateRequest({
        destination: dest,
        items,
        config,
        hasToken,
        eligibleByProductId: mergeShippingEligibleFlags(
            shippingEligibleFlags,
            config?.shippingIneligibleProductIds
        ),
        boxedProductFlags,
    });
    if (eligibilityError) {
        return empty(eligibilityError, 'INFO');
    }

    if (!token || !dest.country_iso2?.trim()) {
        return empty('Thai Nexus is not configured.', 'INFO');
    }

    const destinationCountry = dest.country_iso2.trim();

    const boxes = config?.boxes ?? [];
    const commissionRules = config?.commissionRules ?? [];

    const packing = packItems(items, boxes, documentFlags, {
        boxedProductFlags,
        productWeightUnit: sanitizeProductWeightUnit(config?.productWeightUnit),
        chargeActualWeightOnly: Boolean(config?.chargeActualWeightOnly),
    });
    if (!packing.boxes.length) {
        return {
            quote_id: `tn_err_${Date.now()}`,
            messages: packing.errors.map((text) => ({ text, type: 'ERROR' })),
            carrier_quotes: [],
        };
    }

    const apiCalls: DebugApiCall[] = [];
    const refreshQuotes = options.refreshQuotes !== false;
    const boxQuoteResults = await Promise.all(
        packing.boxes.map(async (box) => {
            const params: QuoteParams = {
                apiToken: token,
                country: destinationCountry,
                state: dest.state_iso2 || '',
                postcode: dest.zip || '',
                city: dest.city || '',
                actual_weight_kg: box.weight,
                length_cm: box.length,
                width_cm: box.width,
                height_cm: box.height,
                is_document: box.isDocument,
            };

            const { quotes, apiCall } = await apiQuoteLive(storeId, params, refreshQuotes);
            apiCalls.push(apiCall);
            return quotes;
        })
    );

    const aggregated = mergeQuotes(boxQuoteResults);
    const boxCount = packing.boxes.length;
    const targetCurrency =
        body.base_options?.currency_code?.toUpperCase() ||
        items[0]?.discounted_price?.currency?.toUpperCase() ||
        'THB';
    const subtotal = cartSubtotal(items);
    const packedWeightKg = packing.boxes.reduce(
        (sum, box) => sum + (Number(box.weight) || 0),
        0
    );
    const itemQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    const allowedLevels = parseZoneServiceLevels(undefined);
    const quotesByCourier = new Map<
        string,
        {
            serviceLevel: string;
            courierSlug: string;
            displayName: string;
            serviceIds: string[];
            v: (typeof aggregated)[string];
            amount: number;
            money: BcCarrierQuote['cost'];
            description: string;
            transit: ReturnType<typeof parseTransitDuration>;
        }
    >();
    const finalQuotesDebug: DebugFinalQuote[] = [];

    for (const [courierKey, v] of Object.entries(aggregated)) {
        if (v.count < boxCount) continue;

        const displayName = v.name;
        const serviceIds = quoteCoverageIds(courierKey, displayName);

        if (!quoteMatchesServiceLevels(displayName, v.days, allowedLevels)) continue;

        const serviceLevel = classifyServiceLevel(displayName, v.days);
        const courierSlug = normalizeServiceId(courierKey);

        let costThb = applyCheckoutPricing(
            v.thb,
            commissionRules,
            {
                items,
                cartSubtotal: subtotal,
                destinationCountry,
                cartWeightKg: packedWeightKg,
                itemQuantity,
                serviceIds: [...serviceIds, courierSlug],
            },
            { pricingMode: config?.pricingMode }
        );
        if (!Number.isFinite(costThb) || costThb < 0) continue;
        costThb = roundMoney(costThb);

        let amount: number;
        try {
            amount = await convertFromThb(costThb, targetCurrency);
        } catch (err) {
            return empty(err instanceof Error ? err.message : 'Currency conversion failed');
        }

        amount = roundMoney(amount);
        const money = { currency: targetCurrency, amount };
        const transit = parseTransitDuration(v.days);
        const description =
            transit != null
                ? `${transit.duration} business day${transit.duration === 1 ? '' : 's'}`
                : String(v.days);

        const existing = quotesByCourier.get(courierKey);
        if (existing && existing.amount <= amount) continue;

        quotesByCourier.set(courierKey, {
            serviceLevel,
            courierSlug,
            displayName,
            serviceIds,
            v,
            amount,
            money,
            description,
            transit,
        });
    }

    const offeredCouriers = filterCheckoutQuotes(
        [...quotesByCourier.values()],
        (entry) => entry.serviceIds,
        destinationCountry,
        config?.disabledServiceIds,
        config?.serviceCoverage
    );

    const quotes: BcCarrierQuote[] = [];
    for (const entry of offeredCouriers) {
        quotes.push({
            code: entry.courierSlug,
            rate_id: `tn_${storeId}_${entry.courierSlug}`,
            display_name: formatServiceDisplayName(entry.displayName),
            description: entry.transit != null ? undefined : entry.description,
            cost: entry.money,
            discounted_cost: { ...entry.money },
            dispatch_date: dispatchDateIso(1),
            transit_time: entry.transit,
            messages: [],
        });

        finalQuotesDebug.push({
            courier: entry.displayName,
            days: entry.v.days,
            final_cost: entry.amount,
        });
    }

    // BigCommerce displays quotes lowest-to-highest; sort so cheapest courier leads.
    quotes.sort((a, b) => a.cost.amount - b.cost.amount);

    const messages = packing.errors.map((text) => ({ text, type: 'WARNING' as const }));

    if (isDebugEnabled()) {
        const debugBoxes: DebugLogBox[] = packing.boxes.map((b) => ({
            // length/width/height are the box inner dims - exactly what was
            // quoted upstream (see PackedBox contract in shared/src/packing.ts).
            name: b.boxName,
            length: b.length,
            width: b.width,
            height: b.height,
            weight: b.weight,
            items: b.items,
            contents: b.contents,
        }));

        await appendDebugLog(storeId, {
            timestamp: new Date().toISOString(),
            products: buildDebugProducts(items),
            box_count: packing.boxes.length,
            boxes: debugBoxes,
            destination: {
                city: dest.city,
                country: dest.country_iso2,
                postcode: dest.zip,
                state: dest.state_iso2,
            },
            api_calls: apiCalls,
            final_quotes: finalQuotesDebug,
            currency: targetCurrency,
        });
    }

    if (!quotes.length) {
        const noCommonCourier =
            boxCount > 1 &&
            boxQuoteResults.some((quotesForBox) => quotesForBox.length > 0) &&
            Object.keys(aggregated).every((key) => aggregated[key].count < boxCount);

        return {
            quote_id: `tn_${Date.now()}`,
            messages: messages.length
                ? messages
                : [
                      {
                          text: noCommonCourier
                              ? 'No single Thai Nexus courier can ship every parcel in this cart. Try fewer items or contact the store.'
                              : 'Thai Nexus does not service this destination or no couriers match this zone.',
                          type: 'WARNING',
                      },
                  ],
            carrier_quotes: [],
        };
    }

    return {
        quote_id: `tn_${Date.now()}`,
        messages,
        carrier_quotes: [{ carrier_info: CARRIER, quotes }],
    };
}
