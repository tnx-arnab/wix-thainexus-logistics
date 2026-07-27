import { CommissionRule, BcRateItem } from './types/thaiNexus.js';

export function calculateTotalCommission(
    rules: CommissionRule[],
    items: BcRateItem[],
    cartSubtotal: number
): number {
    let total = 0;

    for (const rule of rules) {
        if (rule.conditionType === 'subtotal_range') {
            const min = Number(rule.minRange) || 0;
            const max = Number(rule.maxRange) || 0;
            const inRange = cartSubtotal >= min && (max <= 0 || cartSubtotal <= max);
            if (!inRange) continue;

            total += applyFee(rule, cartSubtotal, 0);
            continue;
        }

        if (rule.conditionType === 'specific_products') {
            const ids = new Set((rule.specificProducts || []).map(String));
            let productSubtotal = 0;
            for (const item of items) {
                if (item.product_id && ids.has(String(item.product_id))) {
                    const p = parseFloat(item.discounted_price?.amount || '0');
                    productSubtotal += (Number.isFinite(p) ? p : 0) * (item.quantity || 1);
                }
            }
            if (productSubtotal > 0) {
                total += applyFee(rule, productSubtotal, productSubtotal);
            }
        }
    }

    return Math.round(total * 100) / 100;
}

function applyFee(rule: CommissionRule, base: number, productSubtotal: number): number {
    const value = Number(rule.feeValue) || 0;
    if (rule.feeType === 'percentage') {
        const basis = rule.conditionType === 'specific_products' ? productSubtotal : base;

        return (basis * value) / 100;
    }

    return value;
}
