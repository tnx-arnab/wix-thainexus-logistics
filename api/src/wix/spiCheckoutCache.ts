import type { WixGetShippingRatesRequest, WixShippingRateOption } from './wixShippingRatesAdapter.js';
import { normalizeWixShippingDestination } from './wixShippingDestination.js';
import { spiLinePrimaryProductId } from './spiCatalog.js';

type CacheEntry = { rates: WixShippingRateOption[]; expiresAt: number };

/** Best-effort per-isolate cache so back-to-back checkout SPI calls return the same codes/prices. */
const checkoutCache = new Map<string, CacheEntry>();
const instanceFallback = new Map<string, CacheEntry>();

const TTL_MS = 300_000;
const MAX_ENTRIES = 200;

function cloneRates(rates: WixShippingRateOption[]): WixShippingRateOption[] {
    return rates.map((r) => ({
        ...r,
        cost: { ...r.cost },
        logistics: r.logistics ? { ...r.logistics } : undefined,
    }));
}

export function getInstanceSpiFallback(instanceId: string): WixShippingRateOption[] | null {
    const hit = instanceFallback.get(instanceId);
    if (!hit || hit.expiresAt <= Date.now()) {
        if (hit) instanceFallback.delete(instanceId);
        return null;
    }
    return cloneRates(hit.rates);
}

export function spiCheckoutCacheKey(
    instanceId: string,
    request: WixGetShippingRatesRequest
): string {
    const dest = normalizeWixShippingDestination(request.shippingDestination);
    const lines = (request.lineItems || [])
        .filter((l) => l.physicalProperties?.shippable !== false)
        .map((line, idx) => {
            const id = spiLinePrimaryProductId(
                line,
                line.physicalProperties?.sku || `line_${idx}`
            );
            return `${id}:${line.quantity || 1}`;
        })
        .sort()
        .join('|');

    return [
        instanceId,
        dest.country || '',
        dest.postalCode || '',
        dest.city || '',
        lines,
    ].join('|');
}

export function getSpiCheckoutCache(key: string): WixShippingRateOption[] | null {
    const hit = checkoutCache.get(key);
    if (!hit || hit.expiresAt <= Date.now()) {
        if (hit) checkoutCache.delete(key);
        return null;
    }
    return cloneRates(hit.rates);
}

export function setSpiCheckoutCache(key: string, rates: WixShippingRateOption[]): void {
    if (!rates.length) return;

    const cloned = cloneRates(rates);
    const entry = { rates: cloned, expiresAt: Date.now() + TTL_MS };

    checkoutCache.set(key, entry);

    const instanceId = key.split('|')[0];
    if (instanceId) {
        instanceFallback.set(instanceId, entry);
    }

    if (checkoutCache.size <= MAX_ENTRIES) return;
    const oldest = [...checkoutCache.entries()].sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt
    );
    for (let i = 0; i < oldest.length - MAX_ENTRIES; i++) {
        checkoutCache.delete(oldest[i][0]);
    }
}

export function clearSpiCheckoutCacheForTests(): void {
    checkoutCache.clear();
    instanceFallback.clear();
}
