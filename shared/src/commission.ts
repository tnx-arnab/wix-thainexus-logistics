import { serviceIdsOverlap } from './serviceCoverage.js';
import { normalizeServiceId } from './thaiNexus/shippingProvider.js';
import {
    BcRateItem,
    CheckoutPricingContext,
    CommissionCondition,
    CommissionConditionKind,
    CommissionRule,
    PickupUnit,
    PricingMode,
} from './types/thaiNexus.js';

const CONDITION_KINDS: CommissionConditionKind[] = [
    'subtotal_range',
    'specific_products',
    'destination_country',
    'weight_range',
    'item_quantity',
    'shipping_service',
];

export function pickupThbFromRule(rule: CommissionRule): number {
    if (rule.feeType === 'fixed' || rule.feeType === 'mixed') {
        const value = Number(rule.feeValue) || 0;
        return value > 0 ? value : 0;
    }

    return 0;
}

export function markupPercentFromRule(rule: CommissionRule): number {
    if (rule.feeType === 'mixed') {
        const value = Number(rule.markupPercent) || 0;
        return value > 0 ? value : 0;
    }

    if (rule.feeType === 'quote_percentage') {
        const value = Number(rule.feeValue) || 0;
        return value > 0 ? value : 0;
    }

    return 0;
}

export function cartPercentFromRule(rule: CommissionRule): number {
    if (rule.feeType === 'percentage') {
        const value = Number(rule.feeValue) || 0;
        return value > 0 ? value : 0;
    }

    const extra = Number(rule.cartPercent) || 0;
    return extra > 0 ? extra : 0;
}

export function pickupUnitFromRule(rule: CommissionRule): PickupUnit {
    if (rule.pickupUnit === 'per_item' || rule.pickupUnit === 'per_kg') {
        return rule.pickupUnit;
    }

    return 'once';
}

export function commissionRuleHasEffect(rule: CommissionRule): boolean {
    return (
        pickupThbFromRule(rule) > 0 ||
        markupPercentFromRule(rule) > 0 ||
        cartPercentFromRule(rule) > 0
    );
}

function inMinMax(value: number, min: number, max: number): boolean {
    const lo = Number.isFinite(min) && min > 0 ? min : 0;
    const hi = Number.isFinite(max) && max > 0 ? max : 0;
    if (hi > 0 && lo > hi) return value >= hi && value <= lo;

    return value >= lo && (hi <= 0 || value <= hi);
}

function productIdsFromCondition(condition: CommissionCondition): string[] {
    return (condition.specificProducts || []).map(String).filter(Boolean);
}

function matchingProducts(items: BcRateItem[], productIds: string[]) {
    const ids = new Set(productIds);
    let productSubtotal = 0;
    let matchingQty = 0;
    let inCart = false;

    for (const item of items) {
        const candidates = [
            item.product_id,
            ...(item.catalog_lookup_ids || []),
        ].map((id) => String(id || '')).filter(Boolean);
        if (!candidates.some((id) => ids.has(id))) continue;
        inCart = true;
        const qty = item.quantity || 1;
        matchingQty += qty;
        const p = parseFloat(item.discounted_price?.amount || '0');
        productSubtotal += (Number.isFinite(p) ? p : 0) * qty;
    }

    return { inCart, productSubtotal, matchingQty };
}

function totalItemQuantity(items: BcRateItem[], fallback?: number): number {
    if (Number.isFinite(fallback) && (fallback as number) > 0) {
        return fallback as number;
    }

    return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
}

function conditionIsActive(condition: CommissionCondition): boolean {
    if (!condition || !CONDITION_KINDS.includes(condition.type)) return false;

    if (condition.type === 'subtotal_range') {
        return (Number(condition.minRange) || 0) > 0 || (Number(condition.maxRange) || 0) > 0;
    }

    if (condition.type === 'specific_products') {
        return productIdsFromCondition(condition).length > 0;
    }

    if (condition.type === 'destination_country') {
        return (condition.countries || []).some((c) => String(c || '').trim());
    }

    if (condition.type === 'weight_range') {
        return (Number(condition.minKg) || 0) > 0 || (Number(condition.maxKg) || 0) > 0;
    }

    if (condition.type === 'item_quantity') {
        return (Number(condition.minQuantity) || 0) > 0 || (Number(condition.maxQuantity) || 0) > 0;
    }

    return (condition.serviceIds || []).some((id) => normalizeServiceId(String(id || '')));
}

export function effectiveCommissionConditions(rule: CommissionRule): CommissionCondition[] {
    if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
        return rule.conditions.filter(conditionIsActive);
    }

    if (rule.conditionType === 'specific_products') {
        const specificProducts = (rule.specificProducts || [])
            .map((id) => String(id ?? '').trim())
            .filter(Boolean);
        if (!specificProducts.length) {
            return [{ type: 'specific_products', specificProducts: [] }];
        }

        return [{ type: 'specific_products', specificProducts }];
    }

    const minRange = Number(rule.minRange) || 0;
    const maxRange = Number(rule.maxRange) || 0;
    if (minRange > 0 || maxRange > 0) {
        return [{ type: 'subtotal_range', minRange, maxRange }];
    }

    return [];
}

export function commissionRuleIsAlwaysOn(rule: CommissionRule): boolean {
    const conditions = effectiveCommissionConditions(rule);
    if (!conditions.length) return true;

    return conditions.every(
        (c) =>
            c.type === 'subtotal_range' &&
            (Number(c.minRange) || 0) <= 0 &&
            (Number(c.maxRange) || 0) <= 0
    );
}

function conditionMatches(
    condition: CommissionCondition,
    context: CheckoutPricingContext
): boolean {
    const items = context.items || [];

    if (condition.type === 'subtotal_range') {
        return inMinMax(
            Number(context.cartSubtotal) || 0,
            Number(condition.minRange) || 0,
            Number(condition.maxRange) || 0
        );
    }

    if (condition.type === 'specific_products') {
        const ids = productIdsFromCondition(condition);
        if (!ids.length) return false;

        return matchingProducts(items, ids).inCart;
    }

    if (condition.type === 'destination_country') {
        const dest = String(context.destinationCountry || '')
            .trim()
            .toUpperCase();
        if (!dest) return false;

        const codes = new Set(
            (condition.countries || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
        );
        if (!codes.size) return false;

        return condition.excludeCountries ? !codes.has(dest) : codes.has(dest);
    }

    if (condition.type === 'weight_range') {
        return inMinMax(
            Number(context.cartWeightKg) || 0,
            Number(condition.minKg) || 0,
            Number(condition.maxKg) || 0
        );
    }

    if (condition.type === 'item_quantity') {
        return inMinMax(
            totalItemQuantity(items, context.itemQuantity),
            Number(condition.minQuantity) || 0,
            Number(condition.maxQuantity) || 0
        );
    }

    return serviceIdsOverlap(condition.serviceIds, context.serviceIds);
}

function ruleMatches(
    rule: CommissionRule,
    context: CheckoutPricingContext
): { matched: boolean; productSubtotal: number; matchingQty: number } {
    const items = context.items || [];
    const conditions = effectiveCommissionConditions(rule);
    let productSubtotal = 0;
    let matchingQty = 0;
    let hasProductFilter = false;

    for (const condition of conditions) {
        if (!conditionMatches(condition, context)) {
            return { matched: false, productSubtotal: 0, matchingQty: 0 };
        }

        if (condition.type === 'specific_products') {
            hasProductFilter = true;
            const match = matchingProducts(items, productIdsFromCondition(condition));
            productSubtotal += match.productSubtotal;
            matchingQty += match.matchingQty;
        }
    }

    if (!hasProductFilter) {
        matchingQty = totalItemQuantity(items, context.itemQuantity);
    }

    return { matched: true, productSubtotal, matchingQty };
}

function scaledPickup(
    pickup: number,
    unit: PickupUnit,
    matchingQty: number,
    cartWeightKg: number
): number {
    if (pickup <= 0) return 0;

    if (unit === 'per_item') {
        return pickup * matchingQty;
    }

    if (unit === 'per_kg') {
        return pickup * (Number.isFinite(cartWeightKg) && cartWeightKg > 0 ? cartWeightKg : 0);
    }

    return pickup;
}

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

export function resolvePricingMode(
    rules: CommissionRule[],
    stored?: PricingMode
): PricingMode {
    if (stored === 'advanced' || stored === 'basic') return stored;

    const list = rules || [];
    if (list.some((rule) => !commissionRuleIsAlwaysOn(rule))) return 'advanced';
    if (list.filter(commissionRuleHasEffect).length > 1) return 'advanced';

    return 'basic';
}

export interface ApplyCheckoutPricingOptions {
    pricingMode?: PricingMode;
}

/**
 * checkout_thb = (quote + matching_fixed) × Π(1 + quote_% / 100) + cart/product_%
 */
export function applyCheckoutPricing(
    quoteThb: number,
    rules: CommissionRule[],
    context: CheckoutPricingContext,
    options?: ApplyCheckoutPricingOptions
): number {
    const quote = Number.isFinite(quoteThb) && quoteThb > 0 ? quoteThb : 0;
    const mode = resolvePricingMode(rules || [], options?.pricingMode);
    const activeRules =
        mode === 'basic'
            ? (rules || []).filter(commissionRuleIsAlwaysOn)
            : rules || [];

    let fixedThb = 0;
    let markupMultiplier = 1;
    let additiveThb = 0;

    for (const rule of activeRules) {
        const { matched, productSubtotal, matchingQty } = ruleMatches(rule, context);
        if (!matched) continue;

        const pickup = pickupThbFromRule(rule);
        const markupPercent = markupPercentFromRule(rule);
        const cartPercent = cartPercentFromRule(rule);
        if (pickup <= 0 && markupPercent <= 0 && cartPercent <= 0) {
            if (rule.stopProcessing) break;
            continue;
        }

        if (pickup > 0) {
            fixedThb += scaledPickup(
                pickup,
                pickupUnitFromRule(rule),
                matchingQty,
                Number(context.cartWeightKg) || 0
            );
        }

        if (markupPercent > 0) {
            markupMultiplier *= 1 + markupPercent / 100;
        }

        if (cartPercent > 0) {
            const hasProductFilter = effectiveCommissionConditions(rule).some(
                (c) => c.type === 'specific_products'
            );
            const basis = hasProductFilter ? productSubtotal : Number(context.cartSubtotal) || 0;
            additiveThb += (basis * cartPercent) / 100;
        }

        if (rule.stopProcessing) break;
    }

    const total = (quote + fixedThb) * markupMultiplier + additiveThb;
    if (!Number.isFinite(total) || total < 0) return 0;

    return roundMoney(total);
}

/** Additive commission only (fixed + cart/product %). Quote markup is applied in applyCheckoutPricing. */
export function calculateTotalCommission(
    rules: CommissionRule[],
    context: CheckoutPricingContext,
    options?: ApplyCheckoutPricingOptions
): number {
    return applyCheckoutPricing(0, rules, context, options);
}
