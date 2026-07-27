import { normalizeServiceId } from './thaiNexus/shippingProvider.js';
import { CommissionRule, ShipperProfile, ShippingBox } from './types/thaiNexus.js';

export function validateShipper(shipper: ShipperProfile): string | null {
    if (!shipper?.name?.trim()) return 'Shipper name is required';
    if (!shipper?.phone?.trim()) return 'Shipper phone is required';
    if (!shipper?.street?.trim()) return 'Shipper street address is required';
    if (!shipper?.city?.trim()) return 'Shipper city is required';
    if (!shipper?.postalCode?.trim()) return 'Shipper postal code is required';
    if (!shipper?.country?.trim() || shipper.country.length !== 2) {
        return 'Country must be a 2-letter ISO code (e.g. TH)';
    }

    return null;
}

export function sanitizeCommissionRules(rules: CommissionRule[]): CommissionRule[] {
    return (rules || [])
        .filter((r) => Number(r.feeValue) > 0)
        .map((r, i) => ({
            id: r.id || `rule_${i}`,
            conditionType: r.conditionType || 'subtotal_range',
            minRange: Number(r.minRange) || 0,
            maxRange: Number(r.maxRange) || 0,
            specificProducts: sanitizeProductIds(r.specificProducts),
            feeType: r.feeType === 'percentage' ? 'percentage' : 'fixed',
            feeValue: Number(r.feeValue) || 0,
            feeLabel: r.feeLabel || 'Commission Fee',
        }));
}

export function sanitizeDisabledServiceIds(ids: string[] | undefined): string[] {
    if (!ids?.length) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of ids) {
        const id = normalizeServiceId(String(raw || ''));
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }

    return result;
}

/** Normalize product ids to strings (Wix catalog GUIDs; numeric BC ids also work). */
export function sanitizeProductIds(
    ids: Array<string | number> | undefined
): string[] {
    if (!ids?.length) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of ids) {
        const id = String(raw ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }

    return result;
}

export function sanitizeBoxes(boxes: ShippingBox[]): ShippingBox[] {
    return (boxes || [])
        .filter((b) => b.name?.trim() && b.innerLengthCm > 0)
        .map((b, i) => ({
            id: b.id || `box_${i}`,
            name: b.name.trim(),
            innerLengthCm: Number(b.innerLengthCm) || 0,
            innerWidthCm: Number(b.innerWidthCm) || 0,
            innerDepthCm: Number(b.innerDepthCm) || 0,
            maxWeightKg: Number(b.maxWeightKg) || 0,
            emptyWeightKg: Number(b.emptyWeightKg) || 0,
        }));
}
