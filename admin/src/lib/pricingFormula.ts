import { countryName } from './countries';
import type {
    CommissionCondition,
    CommissionConditionKind,
    CommissionRule,
    PickupUnit,
    PricingMode,
} from './types';

export const EXAMPLE_QUOTE = 1000;
export const BASIC_RULE_ID = 'rule_basic';

export interface FormulaValue {
    pickup: number;
    markupPercent: number;
    cartPercent: number;
}

export function emptyRule(id?: string): CommissionRule {
    return {
        id: id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        conditionType: 'subtotal_range',
        minRange: 0,
        maxRange: 0,
        specificProducts: [],
        conditions: [],
        feeType: 'fixed',
        feeValue: 0,
        feeLabel: 'Commission Fee',
    };
}

export function formatMoney(amount: number, currency: string): string {
    return `${currency}${amount.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

function ruleRecord(rule: CommissionRule): Record<string, unknown> {
    return rule as unknown as Record<string, unknown>;
}

function ruleFeeType(rule: CommissionRule): string {
    const raw = rule.feeType || ruleRecord(rule).fee_type;

    return String(raw || 'fixed');
}

export function pickupFrom(rule: CommissionRule): number {
    if (ruleFeeType(rule) === 'fixed' || ruleFeeType(rule) === 'mixed') {
        const value = Number(rule.feeValue ?? ruleRecord(rule).fee_value) || 0;
        return value > 0 ? value : 0;
    }

    return 0;
}

export function markupPercentFrom(rule: CommissionRule): number {
    if (ruleFeeType(rule) === 'mixed') {
        const value = Number(rule.markupPercent ?? ruleRecord(rule).markup_percent) || 0;
        return value > 0 ? value : 0;
    }

    if (ruleFeeType(rule) === 'quote_percentage') {
        const value = Number(rule.feeValue ?? ruleRecord(rule).fee_value) || 0;
        return value > 0 ? value : 0;
    }

    return 0;
}

export function cartPercentFrom(rule: CommissionRule): number {
    if (ruleFeeType(rule) === 'percentage') {
        const value = Number(rule.feeValue ?? ruleRecord(rule).fee_value) || 0;
        return value > 0 ? value : 0;
    }

    const extra = Number(rule.cartPercent ?? ruleRecord(rule).cart_percent) || 0;
    return extra > 0 ? extra : 0;
}

export function formulaFrom(rule: CommissionRule): FormulaValue {
    return {
        pickup: pickupFrom(rule),
        markupPercent: markupPercentFrom(rule),
        cartPercent: cartPercentFrom(rule),
    };
}

export function ruleHasEffect(rule: CommissionRule): boolean {
    return pickupFrom(rule) > 0 || markupPercentFrom(rule) > 0 || cartPercentFrom(rule) > 0;
}

export function roundHundredths(n: number): number {
    return Math.round(n * 100) / 100;
}

export function multiplierFromPercent(markupPercent: number): number {
    const percent = Number(markupPercent) || 0;
    if (percent <= 0) return 1;

    return Math.round((1 + percent / 100) * 10000) / 10000;
}

export function formatMarkupMultiplier(markupPercent: number): string {
    return String(multiplierFromPercent(markupPercent));
}

export function markupPercentFromMultiplier(raw: string): number {
    if (raw.trim() === '' || raw.trim() === '.') return 0;
    const multiplier = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(multiplier) || multiplier < 1) return 0;

    return roundHundredths((multiplier - 1) * 100);
}

export function withFormula(
    rule: CommissionRule,
    pickup: number,
    markupPercent: number,
    cartPercent: number
): CommissionRule {
    const next: CommissionRule = {
        ...rule,
        feeType: 'fixed',
        feeValue: 0,
    };
    delete next.markupPercent;
    delete next.cartPercent;

    const hasPickup = pickup > 0;
    const hasMarkup = markupPercent > 0;
    const hasCart = cartPercent > 0;

    if (hasPickup && hasMarkup) {
        next.feeType = 'mixed';
        next.feeValue = pickup;
        next.markupPercent = markupPercent;
        if (hasCart) next.cartPercent = cartPercent;
        return next;
    }

    if (hasPickup) {
        next.feeType = 'fixed';
        next.feeValue = pickup;
        if (hasCart) next.cartPercent = cartPercent;
        return next;
    }

    if (hasMarkup) {
        next.feeType = 'quote_percentage';
        next.feeValue = markupPercent;
        if (hasCart) next.cartPercent = cartPercent;
        return next;
    }

    next.feeType = 'percentage';
    next.feeValue = hasCart ? cartPercent : 0;
    return next;
}

export function withFormulaValue(rule: CommissionRule, formula: FormulaValue): CommissionRule {
    return withFormula(rule, formula.pickup, formula.markupPercent, formula.cartPercent);
}

function conditionIsActive(condition: CommissionCondition): boolean {
    if (condition.type === 'subtotal_range') {
        return (Number(condition.minRange) || 0) > 0 || (Number(condition.maxRange) || 0) > 0;
    }

    if (condition.type === 'specific_products') {
        return (condition.specificProducts || []).length > 0;
    }

    if (condition.type === 'destination_country') {
        return (condition.countries || []).length > 0;
    }

    if (condition.type === 'weight_range') {
        return (Number(condition.minKg) || 0) > 0 || (Number(condition.maxKg) || 0) > 0;
    }

    if (condition.type === 'item_quantity') {
        return (Number(condition.minQuantity) || 0) > 0 || (Number(condition.maxQuantity) || 0) > 0;
    }

    return (condition.serviceIds || []).length > 0;
}

export function effectiveConditions(rule: CommissionRule): CommissionCondition[] {
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

export function isAlwaysOn(rule: CommissionRule): boolean {
    const conditions = effectiveConditions(rule);
    if (!conditions.length) return true;

    return conditions.every(
        (c) =>
            c.type === 'subtotal_range' &&
            (Number(c.minRange) || 0) <= 0 &&
            (Number(c.maxRange) || 0) <= 0
    );
}

export function inferPricingMode(
    rules: CommissionRule[],
    stored?: PricingMode | string | null
): PricingMode {
    if (stored === 'advanced' || stored === 'basic') return stored;

    const list = rules || [];
    if (list.some((rule) => !isAlwaysOn(rule))) return 'advanced';
    if (list.filter(ruleHasEffect).length > 1) return 'advanced';

    return 'basic';
}

export function firstAlwaysOn(rules: CommissionRule[]): CommissionRule | undefined {
    return rules.find(isAlwaysOn);
}

export function combineAlwaysOnFormula(rules: CommissionRule[]): FormulaValue {
    let pickup = 0;
    let multiplier = 1;
    let cartPercent = 0;

    for (const rule of rules.filter(isAlwaysOn)) {
        pickup += pickupFrom(rule);
        const markupPercent = markupPercentFrom(rule);
        if (markupPercent > 0) {
            multiplier *= 1 + markupPercent / 100;
        }
        cartPercent += cartPercentFrom(rule);
    }

    return {
        pickup,
        markupPercent: multiplier > 1 ? roundHundredths((multiplier - 1) * 100) : 0,
        cartPercent,
    };
}

export function mergeBasicFormula(
    rules: CommissionRule[],
    formula: FormulaValue,
    feeLabel?: string
): CommissionRule[] {
    const advanced = rules.filter((rule) => !isAlwaysOn(rule));
    const existing = firstAlwaysOn(rules);
    const next = withFormulaValue(existing || emptyRule(BASIC_RULE_ID), formula);
    if (feeLabel !== undefined) next.feeLabel = feeLabel || 'Commission Fee';
    next.conditions = [];
    next.conditionType = 'subtotal_range';
    next.minRange = 0;
    next.maxRange = 0;
    next.specificProducts = [];
    delete next.pickupUnit;
    delete next.stopProcessing;

    if (!ruleHasEffect(next)) return advanced.filter(ruleHasEffect);

    return [next, ...advanced.filter(ruleHasEffect)];
}

export function pickupUnitLabel(unit: PickupUnit | undefined): string {
    if (unit === 'per_item') return 'per item';
    if (unit === 'per_kg') return 'per kg';

    return 'once';
}

function describeCondition(condition: CommissionCondition, currency: string): string {
    if (condition.type === 'subtotal_range') {
        const min = Number(condition.minRange) || 0;
        const max = Number(condition.maxRange) || 0;
        if (max > 0) {
            return `cart subtotal is between ${formatMoney(min, currency)} and ${formatMoney(max, currency)}`;
        }

        return min > 0
            ? `cart subtotal is ${formatMoney(min, currency)} or more`
            : 'any cart subtotal';
    }

    if (condition.type === 'specific_products') {
        const count = (condition.specificProducts || []).length;
        if (!count) return 'selected products are in the cart';

        return `any of the ${count} selected product${count === 1 ? '' : 's'} is in the cart`;
    }

    if (condition.type === 'destination_country') {
        const names = (condition.countries || []).map((c) => countryName(c));
        const list =
            names.length > 3
                ? `${names.slice(0, 3).join(', ')} +${names.length - 3}`
                : names.join(', ');
        return condition.excludeCountries
            ? `destination is not ${list || 'the selected countries'}`
            : `destination is ${list || 'a selected country'}`;
    }

    if (condition.type === 'weight_range') {
        const min = Number(condition.minKg) || 0;
        const max = Number(condition.maxKg) || 0;
        if (max > 0) return `packed weight is ${min}-${max} kg`;

        return min > 0 ? `packed weight is ${min} kg or more` : 'any packed weight';
    }

    if (condition.type === 'item_quantity') {
        const min = Number(condition.minQuantity) || 0;
        const max = Number(condition.maxQuantity) || 0;
        if (max > 0) return `item quantity is ${min}-${max}`;

        return min > 0 ? `item quantity is ${min} or more` : 'any item quantity';
    }

    const count = (condition.serviceIds || []).length;
    return count
        ? `shipping service is one of ${count} selected`
        : 'a selected shipping service is quoted';
}

export function describeWhen(rule: CommissionRule, currency: string): string {
    const conditions = effectiveConditions(rule);
    if (!conditions.length) return 'any cart';

    return conditions.map((c) => describeCondition(c, currency)).join(', and ');
}

export function describeFormula(rule: CommissionRule, currency: string): string {
    const pickup = pickupFrom(rule);
    const markupPercent = markupPercentFrom(rule);
    const cartPercent = cartPercentFrom(rule);
    const unit = rule.pickupUnit || 'once';
    const multiplier = markupPercent > 0 ? multiplierFromPercent(markupPercent) : 1;

    let pickupBit = '';
    if (pickup > 0) {
        pickupBit =
            unit === 'per_item'
                ? `${formatMoney(pickup, currency)} pickup per item`
                : unit === 'per_kg'
                  ? `${formatMoney(pickup, currency)} pickup per kg`
                  : formatMoney(pickup, currency);
    }

    let formula = '';
    if (pickup > 0 && markupPercent > 0) {
        formula = `(Thai Nexus quote + ${pickupBit}) x ${multiplier}`;
    } else if (pickup > 0) {
        formula = `Thai Nexus quote + ${pickupBit}`;
    } else if (markupPercent > 0) {
        formula = `Thai Nexus quote x ${multiplier}`;
    }

    if (cartPercent > 0) {
        const hasProducts = effectiveConditions(rule).some((c) => c.type === 'specific_products');
        const cartBit = hasProducts
            ? `add ${cartPercent}% of those products' line subtotal`
            : `add ${cartPercent}% of the cart subtotal`;
        formula = formula ? `${formula}, then ${cartBit}` : cartBit.replace(/^a/, 'A');
    }

    return formula || 'no fee';
}

export function describeRule(rule: CommissionRule, currency: string): string {
    if (!ruleHasEffect(rule)) {
        return 'Set pickup, markup, or cart % above 0 for this rule to take effect at checkout.';
    }

    const when = describeWhen(rule, currency);
    const formula = describeFormula(rule, currency);
    const stop = rule.stopProcessing ? ' Later rules are skipped if this matches.' : '';

    return `When ${when}, shipping price = ${formula} (shown as part of the shipping price).${stop}`;
}

export function describeExample(rule: CommissionRule, currency: string): string | null {
    const pickup = pickupFrom(rule);
    const markupPercent = markupPercentFrom(rule);
    if (pickup <= 0 && markupPercent <= 0) return null;

    const unit = rule.pickupUnit || 'once';
    const multiplier = markupPercent > 0 ? multiplierFromPercent(markupPercent) : 1;
    const scaledPickup =
        unit === 'per_item' ? pickup * 2 : unit === 'per_kg' ? pickup * 2 : pickup;
    const total = roundHundredths((EXAMPLE_QUOTE + scaledPickup) * multiplier);

    if (unit === 'per_item') {
        return `If Thai Nexus quotes ${formatMoney(EXAMPLE_QUOTE, currency)} and qty is 2: (${EXAMPLE_QUOTE.toLocaleString()} + ${scaledPickup.toLocaleString()}) x ${multiplier} = ${formatMoney(total, currency)}.`;
    }

    if (unit === 'per_kg') {
        return `If Thai Nexus quotes ${formatMoney(EXAMPLE_QUOTE, currency)} and packed weight is 2 kg: (${EXAMPLE_QUOTE.toLocaleString()} + ${scaledPickup.toLocaleString()}) x ${multiplier} = ${formatMoney(total, currency)}.`;
    }

    return `If Thai Nexus quotes ${formatMoney(EXAMPLE_QUOTE, currency)}: (${EXAMPLE_QUOTE.toLocaleString()} + ${pickup.toLocaleString()}) x ${multiplier} = ${formatMoney(total, currency)}.`;
}

function rangeMaxBelowMin(min: number, max: number): boolean {
    return max > 0 && min > max;
}

export function conditionIncomplete(condition: CommissionCondition): string | null {
    if (condition.type === 'subtotal_range') {
        const min = Number(condition.minRange) || 0;
        const max = Number(condition.maxRange) || 0;
        if (min <= 0 && max <= 0) return 'Set a min or max cart subtotal.';
        if (rangeMaxBelowMin(min, max)) return 'Max subtotal must be greater than min.';

        return null;
    }

    if (condition.type === 'specific_products') {
        return (condition.specificProducts || []).length ? null : 'Select at least one product.';
    }

    if (condition.type === 'destination_country') {
        return (condition.countries || []).length ? null : 'Select at least one country.';
    }

    if (condition.type === 'weight_range') {
        const min = Number(condition.minKg) || 0;
        const max = Number(condition.maxKg) || 0;
        if (min <= 0 && max <= 0) return 'Set a min or max packed weight.';
        if (rangeMaxBelowMin(min, max)) return 'Max weight must be greater than min.';

        return null;
    }

    if (condition.type === 'item_quantity') {
        const min = Number(condition.minQuantity) || 0;
        const max = Number(condition.maxQuantity) || 0;
        if (min <= 0 && max <= 0) return 'Set a min or max item quantity.';
        if (rangeMaxBelowMin(min, max)) return 'Max quantity must be greater than min.';

        return null;
    }

    return (condition.serviceIds || []).length ? null : 'Select at least one shipping service.';
}

export const CONDITION_OPTIONS: Array<{
    type: CommissionConditionKind;
    label: string;
    hint: string;
}> = [
    { type: 'subtotal_range', label: 'Cart subtotal', hint: 'Min and/or max cart total' },
    { type: 'specific_products', label: 'Specific products', hint: 'Selected products in the cart' },
    { type: 'destination_country', label: 'Destination', hint: 'Include or exclude countries' },
    { type: 'weight_range', label: 'Packed weight', hint: 'Shipment weight in kg' },
    { type: 'item_quantity', label: 'Item quantity', hint: 'Total units in the cart' },
    { type: 'shipping_service', label: 'Shipping service', hint: 'Thai Nexus courier quoted' },
];
