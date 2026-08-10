/** Flat destination fields used by wixRequestToRateRequest. */
export type WixShippingDestinationFlat = {
    country?: string;
    subdivision?: string;
    city?: string;
    postalCode?: string;
    addressLine?: string;
    addressLine2?: string;
};

const ISO3_TO_ISO2: Record<string, string> = {
    GBR: 'GB',
    USA: 'US',
    ARE: 'AE',
    AUS: 'AU',
    CAN: 'CA',
    DEU: 'DE',
    FRA: 'FR',
    ITA: 'IT',
    JPN: 'JP',
    MEX: 'MX',
    NLD: 'NL',
    NZL: 'NZ',
    SAU: 'SA',
    SGP: 'SG',
    THA: 'TH',
};

export function normalizeCountryIso2(code?: string): string {
    const raw = (code || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw === 'UK') return 'GB';
    if (raw.length === 2) return raw;
    if (ISO3_TO_ISO2[raw]) return ISO3_TO_ISO2[raw];
    return raw.length === 3 ? raw.slice(0, 2) : raw;
}

/**
 * Wix SPI sends AddressWithContact: { address: { country, city, postalCode, ... } }.
 * Some payloads use flat fields on shippingDestination.
 */
export function normalizeWixShippingDestination(raw: unknown): WixShippingDestinationFlat {
    if (!raw || typeof raw !== 'object') return {};

    const d = raw as Record<string, unknown>;
    const flat = (src: Record<string, unknown>): WixShippingDestinationFlat => ({
        country: normalizeCountryIso2(String(src.country || src.countryCode || '')),
        subdivision: String(src.subdivision || src.state || src.stateIso2 || ''),
        city: String(src.city || ''),
        postalCode: String(src.postalCode || src.zip || src.postCode || ''),
        addressLine: String(
            src.addressLine || src.street || src.streetAddress || src.line1 || ''
        ),
        addressLine2: String(src.addressLine2 || src.line2 || ''),
    });

    if (d.country || d.postalCode || d.city || d.addressLine) {
        return flat(d);
    }

    const addr = (d.address || d) as Record<string, unknown>;
    return flat(addr);
}

export function lineDisplayName(line: Record<string, unknown>): string {
    if (typeof line.name === 'string' && line.name.trim()) return line.name.trim();
    const pn = line.productName;
    if (pn && typeof pn === 'object') {
        const o = pn as Record<string, unknown>;
        if (typeof o.translated === 'string' && o.translated.trim()) return o.translated.trim();
        if (typeof o.original === 'string' && o.original.trim()) return o.original.trim();
    }
    return 'Item';
}

export function lineUnitPriceAmount(line: Record<string, unknown>): string {
    const price = line.price;
    if (price && typeof price === 'object') {
        const amount = (price as Record<string, unknown>).amount;
        if (amount != null) return String(amount);
    }
    if (line.totalPrice && typeof line.totalPrice === 'object') {
        const amount = (line.totalPrice as Record<string, unknown>).amount;
        if (amount != null) return String(amount);
    }
    if (line.price != null) return String(line.price);
    return '0';
}
