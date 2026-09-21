import {
    cartPercentFromRule,
    commissionRuleHasEffect,
    markupPercentFromRule,
    pickupThbFromRule,
} from './commission.js';
import { isIso2Country } from './countries.js';
import { normalizeServiceId } from './thaiNexus/shippingProvider.js';
import {
    CommissionCondition,
    CommissionConditionKind,
    CommissionRule,
    FeeType,
    PickupUnit,
    PricingMode,
    ProductWeightUnit,
    ServiceCoverage,
    ShipperProfile,
    ShippingBox,
} from './types/thaiNexus.js';

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

const CONDITION_KINDS: CommissionConditionKind[] = [
    'subtotal_range',
    'specific_products',
    'destination_country',
    'weight_range',
    'item_quantity',
    'shipping_service',
];

function sanitizeServiceIds(ids: string[] | undefined): string[] {
    return sanitizeDisabledServiceIds(ids);
}

function sanitizeBoundedRange(
    minRaw: unknown,
    maxRaw: unknown,
    integer = false
): { min: number; max: number } | null {
    let min = Number(minRaw);
    let max = Number(maxRaw);
    if (!Number.isFinite(min) || min < 0) min = 0;
    if (!Number.isFinite(max) || max < 0) max = 0;
    if (integer) {
        min = Math.round(min);
        max = Math.round(max);
    }
    if (min <= 0 && max <= 0) return null;
    if (max > 0 && min > max) {
        const swapped = min;
        min = max;
        max = swapped;
    }

    return { min, max };
}

function sanitizeCondition(raw: unknown): CommissionCondition | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const input = raw as CommissionCondition;
    if (!CONDITION_KINDS.includes(input.type)) return null;

    if (input.type === 'subtotal_range') {
        const range = sanitizeBoundedRange(input.minRange, input.maxRange);
        if (!range) return null;

        return { type: 'subtotal_range', minRange: range.min, maxRange: range.max };
    }

    if (input.type === 'specific_products') {
        const specificProducts = sanitizeProductIds(input.specificProducts);
        if (!specificProducts.length) return null;

        return { type: 'specific_products', specificProducts };
    }

    if (input.type === 'destination_country') {
        const seen = new Set<string>();
        const countries: string[] = [];
        for (const code of input.countries || []) {
            const iso = String(code || '')
                .trim()
                .toUpperCase();
            if (!isIso2Country(iso) || seen.has(iso)) continue;
            seen.add(iso);
            countries.push(iso);
        }
        if (!countries.length) return null;

        const next: CommissionCondition = { type: 'destination_country', countries };
        if (input.excludeCountries) next.excludeCountries = true;

        return next;
    }

    if (input.type === 'weight_range') {
        const range = sanitizeBoundedRange(input.minKg, input.maxKg);
        if (!range) return null;

        return { type: 'weight_range', minKg: range.min, maxKg: range.max };
    }

    if (input.type === 'item_quantity') {
        const range = sanitizeBoundedRange(input.minQuantity, input.maxQuantity, true);
        if (!range) return null;

        return { type: 'item_quantity', minQuantity: range.min, maxQuantity: range.max };
    }

    const serviceIds = sanitizeServiceIds(input.serviceIds);
    if (!serviceIds.length) return null;

    return { type: 'shipping_service', serviceIds };
}

function conditionsFromLegacy(rule: CommissionRule): CommissionCondition[] {
    if (rule.conditionType === 'specific_products') {
        const specificProducts = sanitizeProductIds(rule.specificProducts);
        if (!specificProducts.length) return [];

        return [{ type: 'specific_products', specificProducts }];
    }

    const minRange = Number(rule.minRange) || 0;
    const maxRange = Number(rule.maxRange) || 0;
    if (minRange > 0 || maxRange > 0) {
        return [{ type: 'subtotal_range', minRange, maxRange }];
    }

    return [];
}

function sanitizePickupUnit(value: unknown): PickupUnit | undefined {
    if (value === 'per_item' || value === 'per_kg') return value;

    return undefined;
}

export function sanitizePricingMode(value: unknown): PricingMode | undefined {
    if (value === 'basic' || value === 'advanced') return value;

    return undefined;
}

function normalizeCommissionRule(rule: CommissionRule, index: number): CommissionRule {
    const pickup = pickupThbFromRule(rule);
    const markupPercent = markupPercentFromRule(rule);
    const cartPercent = cartPercentFromRule(rule);

    let feeType: FeeType;
    let feeValue: number;
    let storedMarkup: number | undefined;
    let storedCart: number | undefined;

    if (pickup > 0 && markupPercent > 0) {
        feeType = 'mixed';
        feeValue = pickup;
        storedMarkup = markupPercent;
        storedCart = cartPercent > 0 ? cartPercent : undefined;
    } else if (pickup > 0) {
        feeType = 'fixed';
        feeValue = pickup;
        storedCart = cartPercent > 0 ? cartPercent : undefined;
    } else if (markupPercent > 0) {
        feeType = 'quote_percentage';
        feeValue = markupPercent;
        storedCart = cartPercent > 0 ? cartPercent : undefined;
    } else {
        feeType = 'percentage';
        feeValue = cartPercent;
    }

    const conditions = (
        Array.isArray(rule.conditions) && rule.conditions.length
            ? rule.conditions.map(sanitizeCondition).filter((c): c is CommissionCondition => Boolean(c))
            : conditionsFromLegacy(rule)
    );

    const productCondition = conditions.find((c) => c.type === 'specific_products');
    const subtotalCondition = conditions.find((c) => c.type === 'subtotal_range');
    const conditionType = productCondition && !subtotalCondition ? 'specific_products' : 'subtotal_range';

    const sanitized: CommissionRule = {
        id: rule.id || `rule_${index}`,
        conditionType,
        minRange: subtotalCondition?.minRange || 0,
        maxRange: subtotalCondition?.maxRange || 0,
        specificProducts: productCondition?.specificProducts || [],
        feeType,
        feeValue,
        feeLabel: rule.feeLabel || 'Commission Fee',
    };

    if (conditions.length) {
        sanitized.conditions = conditions;
    }

    if (storedMarkup && storedMarkup > 0) {
        sanitized.markupPercent = storedMarkup;
    }

    if (storedCart && storedCart > 0) {
        sanitized.cartPercent = storedCart;
    }

    const pickupUnit = sanitizePickupUnit(rule.pickupUnit);
    if (pickupUnit) {
        sanitized.pickupUnit = pickupUnit;
    }

    if (rule.stopProcessing) {
        sanitized.stopProcessing = true;
    }

    return sanitized;
}

export function sanitizeCommissionRules(rules: CommissionRule[]): CommissionRule[] {
    return (rules || []).filter(commissionRuleHasEffect).map((r, i) => normalizeCommissionRule(r, i));
}

export function sanitizeProductWeightUnit(unit: unknown): ProductWeightUnit {
    const u = String(unit || '')
        .trim()
        .toLowerCase();
    if (u === 'g' || u === 'gram' || u === 'grams') return 'g';

    return 'kg';
}

export function sanitizeChargeActualWeightOnly(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        return v === 'true' || v === '1';
    }

    return false;
}

/** Missing/undefined defaults to true (WP-style automation on). */
export function sanitizeEnabledFlag(value: unknown, defaultValue = true): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'false' || v === '0' || v === 'no') return false;
        if (v === 'true' || v === '1' || v === 'yes') return true;
    }

    return Boolean(value);
}

export function isIncompleteServiceCoverage(coverage: ServiceCoverage | undefined): boolean {
    if (!coverage) return false;
    if (coverage.restOfWorld) return false;
    if (coverage.excludeCountries) return !(coverage.countries || []).length;
    if (coverage.worldwide) return false;

    return !(coverage.countries || []).length;
}

export function sanitizeServiceCoverage(
    raw: Record<string, ServiceCoverage> | undefined
): Record<string, ServiceCoverage> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const result: Record<string, ServiceCoverage> = {};

    for (const [key, value] of Object.entries(raw)) {
        const id = normalizeServiceId(key);
        if (!id) continue;

        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

        const restOfWorld = value.restOfWorld === true;
        const excludeCountries = !restOfWorld && value.excludeCountries === true;
        const worldwide = !restOfWorld && !excludeCountries && value.worldwide !== false;
        const seen = new Set<string>();
        const countries: string[] = [];

        for (const code of value.countries || []) {
            const iso = String(code || '')
                .trim()
                .toUpperCase();
            if (!isIso2Country(iso) || seen.has(iso)) continue;
            seen.add(iso);
            countries.push(iso);
        }

        if (restOfWorld) {
            result[id] = { worldwide: false, restOfWorld: true, countries: [] };
            continue;
        }

        if (excludeCountries) {
            result[id] = { worldwide: true, excludeCountries: true, countries };
            continue;
        }

        result[id] = worldwide
            ? { worldwide: true, countries: [] }
            : { worldwide: false, countries };
    }

    return result;
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
