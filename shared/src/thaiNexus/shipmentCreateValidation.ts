import { countryNameToIso2, isIso2Country } from '../countries.js';
import { validateShipper } from '../validation.js';
import type { ShipperProfile } from '../types/thaiNexus.js';

/** Thai Nexus create requires each dimension at least 1 cm. */
export const MIN_API_DIMENSION_CM = 1;

export const MIN_API_ACTUAL_WEIGHT_KG = 0.01;

export function clampDimensionCmForApi(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return MIN_API_DIMENSION_CM;
    return Math.max(MIN_API_DIMENSION_CM, Math.round(value * 100) / 100);
}

export function clampActualWeightKgForApi(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return MIN_API_ACTUAL_WEIGHT_KG;
    return Math.max(Math.round(value * 100) / 100, MIN_API_ACTUAL_WEIGHT_KG);
}

export function normalizeCountryIso2(raw: string | undefined, fallback = 'TH'): string {
    const fromName = countryNameToIso2(raw);
    if (fromName) return fromName;

    const trimmed = String(raw ?? '')
        .trim()
        .toUpperCase();
    if (trimmed.length === 3) {
        const iso3: Record<string, string> = {
            USA: 'US',
            GBR: 'GB',
            ARE: 'AE',
            AUS: 'AU',
            CAN: 'CA',
            DEU: 'DE',
            FRA: 'FR',
            JPN: 'JP',
            CHN: 'CN',
            IND: 'IN',
            BGD: 'BD',
            THA: 'TH',
        };
        if (iso3[trimmed]) return iso3[trimmed];
    }

    const fb = String(fallback || 'TH')
        .trim()
        .toUpperCase();
    return fb.length === 2 && isIso2Country(fb) ? fb : 'TH';
}

function trim(value: unknown): string {
    return String(value ?? '').trim();
}

/** City is required on create; Wix orders sometimes omit it. */
export function resolveRequiredCity(city: string, state: string, postalCode: string): string {
    for (const candidate of [city, state, postalCode]) {
        const s = trim(candidate);
        if (s) return s;
    }
    return 'N/A';
}

export type ThaiNexusAddressRow = Record<string, string>;

export function buildThaiNexusAddressRow(input: {
    name?: string;
    phone?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    email?: string;
}): ThaiNexusAddressRow {
    const email = trim(input.email);
    const looksLikeEmail = email.includes('@') && email.includes('.');
    return {
        name: trim(input.name),
        phone: trim(input.phone),
        ...(looksLikeEmail ? { email } : {}),
        address_line1: trim(input.street),
        city: trim(input.city),
        state: trim(input.state),
        postal_code: trim(input.postalCode),
        country: trim(input.country),
    };
}

/** Fill required address fields before shipmentCrud create. */
export function finalizeAddressForShipmentCreate(
    row: ThaiNexusAddressRow,
    options?: { defaultCountry?: string }
): ThaiNexusAddressRow {
    const defaultCountry = normalizeCountryIso2(options?.defaultCountry, 'TH');

    return {
        ...row,
        name: trim(row.name) || 'Customer',
        phone: trim(row.phone) || '0000000000',
        address_line1: trim(row.address_line1) || 'N/A',
        city: resolveRequiredCity(row.city || '', row.state || '', row.postal_code || ''),
        state: trim(row.state),
        postal_code: trim(row.postal_code),
        country: normalizeCountryIso2(row.country, defaultCountry),
    };
}

export function validateConsigneeForCreate(row: ThaiNexusAddressRow): string | null {
    if (!trim(row.name)) return 'consignee name is required';
    if (!trim(row.phone)) return 'consignee phone is required';
    if (!trim(row.address_line1)) return 'consignee address_line1 is required';
    if (!trim(row.city)) return 'consignee city is required';
    const country = trim(row.country);
    if (!country || country.length !== 2) return 'consignee country must be a 2-letter ISO code';
    return null;
}

export function assertShipperReadyForCreate(shipper: ShipperProfile): void {
    const err = validateShipper(shipper);
    if (err) {
        throw new Error(
            `Shipper settings incomplete: ${err}. Fix in app Settings before creating shipments.`
        );
    }
}
