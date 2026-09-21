import {
    CARRIER_DISPLAY_NAME,
    formatServiceDisplayName,
    normalizeServiceId,
} from './thaiNexus/shippingProvider.js';
import type { ServiceCoverage } from './types/thaiNexus.js';

const CARRIER_SLUG = normalizeServiceId(CARRIER_DISPLAY_NAME);

function serviceAliases(value: string): string[] {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const seen = new Set<string>();
    const aliases: string[] = [];
    const add = (id: string) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        aliases.push(id);
    };

    const id = normalizeServiceId(raw);
    add(id);
    add(normalizeServiceId(formatServiceDisplayName(raw)));

    const prefix = `${CARRIER_SLUG}_`;
    if (id.startsWith(prefix) && id.length > prefix.length) {
        add(id.slice(prefix.length));
    }

    return aliases;
}

export function coverageIds(serviceId: string | string[]): string[] {
    const raw = Array.isArray(serviceId) ? serviceId : [serviceId];
    const seen = new Set<string>();
    const ids: string[] = [];

    for (const value of raw) {
        for (const alias of serviceAliases(String(value || ''))) {
            if (seen.has(alias)) continue;
            seen.add(alias);
            ids.push(alias);
        }
    }

    return ids;
}

function lookupCoverage(
    serviceId: string | string[],
    coverage: Record<string, ServiceCoverage> | undefined
): ServiceCoverage | undefined {
    if (!coverage) return undefined;

    const want = new Set(coverageIds(serviceId));
    if (!want.size) return undefined;

    for (const [key, rule] of Object.entries(coverage)) {
        if (serviceAliases(key).some((alias) => want.has(alias))) return rule;
    }

    return undefined;
}

function isDisabledService(
    serviceId: string | string[],
    disabledServiceIds: string[] | undefined
): boolean {
    const want = new Set(coverageIds(serviceId));
    for (const raw of disabledServiceIds ?? []) {
        if (serviceAliases(String(raw || '')).some((alias) => want.has(alias))) return true;
    }

    return false;
}

/** IDs used at checkout for a Thai Nexus quote (courier key + display name). */
export function quoteCoverageIds(courierKey: string, displayName: string): string[] {
    return coverageIds([courierKey, displayName, formatServiceDisplayName(displayName)]);
}

/** True when a stored service condition can match a quoted courier. */
export function serviceIdsOverlap(
    stored: string[] | undefined,
    quoted: string[] | undefined
): boolean {
    const want = new Set(coverageIds(stored || []));
    if (!want.size) return false;

    return coverageIds(quoted || []).some((id) => want.has(id));
}

/** Persist id + name aliases the same way Settings stores coverage keys. */
export function serviceRecordIds(service: { id?: string; service_name?: string }): string[] {
    return coverageIds([service.id || '', service.service_name || '']);
}

export function isRestOfWorldService(
    serviceId: string | string[],
    coverage: Record<string, ServiceCoverage> | undefined
): boolean {
    return Boolean(lookupCoverage(serviceId, coverage)?.restOfWorld);
}

/** Keep rest-of-world quotes only when no other enabled service is offered. */
export function applyRestOfWorldFallback<T>(
    quotes: T[],
    isRestOfWorld: (quote: T) => boolean
): T[] {
    const primary = quotes.filter((quote) => !isRestOfWorld(quote));
    return primary.length ? primary : quotes;
}

/**
 * Checkout offer list: country rules first, then rest-of-world fallback.
 * Matches the filter used when building BigCommerce rate quotes.
 */
export function filterCheckoutQuotes<T>(
    quotes: T[],
    idsFor: (quote: T) => string | string[],
    destinationCountry: string,
    disabledServiceIds: string[] | undefined,
    coverage: Record<string, ServiceCoverage> | undefined
): T[] {
    const eligible = quotes.filter((quote) =>
        serviceCoversDestination(
            idsFor(quote),
            destinationCountry,
            disabledServiceIds,
            coverage
        )
    );

    return applyRestOfWorldFallback(eligible, (quote) =>
        isRestOfWorldService(idsFor(quote), coverage)
    );
}

/** Enabled services with no coverage entry are worldwide (any dest the carrier quotes). */
export function serviceCoversDestination(
    serviceId: string | string[],
    destinationCountry: string,
    disabledServiceIds: string[] | undefined,
    coverage: Record<string, ServiceCoverage> | undefined
): boolean {
    const ids = coverageIds(serviceId);
    if (!ids.length) return false;
    if (isDisabledService(serviceId, disabledServiceIds)) return false;

    const rule = lookupCoverage(serviceId, coverage);
    if (!rule) return true;

    const dest = destinationCountry.trim().toUpperCase();
    const listed = (code: string) => code.trim().toUpperCase() === dest;

    if (rule.excludeCountries) {
        if (!rule.countries?.length) return false;
        if (!dest) return false;
        return !rule.countries.some(listed);
    }

    if (rule.worldwide) return true;

    if (rule.restOfWorld) {
        return Boolean(dest);
    }

    // Selected-countries mode with an empty list covers nothing.
    if (!rule.countries?.length) return false;

    if (!dest) return false;

    return rule.countries.some(listed);
}
