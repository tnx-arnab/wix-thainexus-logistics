import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applyCheckoutPricing,
    calculateTotalCommission,
    commissionRuleIsAlwaysOn,
} from './commission.js';
import type { BcRateItem, CheckoutPricingContext, CommissionRule } from './types/thaiNexus.js';
import { sanitizeCommissionRules, sanitizePricingMode } from './validation.js';

const item: BcRateItem = {
    product_id: '101',
    name: 'Sample',
    quantity: 1,
    discounted_price: { currency: 'THB', amount: '500' },
};

function ctx(overrides: Partial<CheckoutPricingContext> = {}): CheckoutPricingContext {
    return {
        items: [item],
        cartSubtotal: 500,
        destinationCountry: 'TH',
        cartWeightKg: 1,
        itemQuantity: 1,
        serviceIds: ['flex_dap'],
        ...overrides,
    };
}

const pickup: CommissionRule = {
    id: 'pickup',
    conditionType: 'subtotal_range',
    minRange: 0,
    maxRange: 0,
    feeType: 'fixed',
    feeValue: 150,
    feeLabel: 'Pickup',
};

const markup: CommissionRule = {
    id: 'markup',
    conditionType: 'subtotal_range',
    minRange: 0,
    maxRange: 0,
    feeType: 'quote_percentage',
    feeValue: 15,
    feeLabel: 'Markup',
};

const mixed: CommissionRule = {
    id: 'mixed',
    conditionType: 'subtotal_range',
    minRange: 0,
    maxRange: 0,
    feeType: 'mixed',
    feeValue: 150,
    markupPercent: 15,
    feeLabel: 'Pickup + markup',
};

describe('applyCheckoutPricing', () => {
    it('applies (quote + pickup) x markup', () => {
        assert.equal(applyCheckoutPricing(1000, [pickup, markup], ctx()), 1322.5);
    });

    it('applies mixed pickup + markup on one rule', () => {
        assert.equal(applyCheckoutPricing(1000, [mixed], ctx()), 1322.5);
    });

    it('leaves cart-percentage rules additive after markup', () => {
        const cartPct: CommissionRule = {
            id: 'cart',
            conditionType: 'subtotal_range',
            minRange: 0,
            maxRange: 0,
            feeType: 'percentage',
            feeValue: 10,
            feeLabel: 'Cart percent',
        };

        assert.equal(
            applyCheckoutPricing(1000, [pickup, markup, cartPct], ctx()),
            1372.5
        );
    });

    it('keeps existing fixed-only commission as quote + fee', () => {
        assert.equal(applyCheckoutPricing(1000, [pickup], ctx()), 1150);
    });

    it('applies product-specific pickup when the product price is 0', () => {
        const freeItem: BcRateItem = {
            ...item,
            discounted_price: { currency: 'THB', amount: '0' },
        };
        const productPickup: CommissionRule = {
            id: 'gift-pickup',
            conditionType: 'specific_products',
            specificProducts: [101],
            feeType: 'fixed',
            feeValue: 150,
            feeLabel: 'Pickup',
        };

        assert.equal(
            applyCheckoutPricing(1000, [productPickup], ctx({ items: [freeItem], cartSubtotal: 0 })),
            1150
        );
    });

    it('matches specific products via catalog_lookup_ids', () => {
        const variantLine: BcRateItem = {
            product_id: 'variant-9',
            catalog_lookup_ids: ['101'],
            name: 'Variant',
            quantity: 1,
            discounted_price: { currency: 'THB', amount: '0' },
        };
        const productPickup: CommissionRule = {
            id: 'catalog-pickup',
            conditionType: 'specific_products',
            specificProducts: ['101'],
            feeType: 'fixed',
            feeValue: 150,
            feeLabel: 'Pickup',
        };

        assert.equal(
            applyCheckoutPricing(1000, [productPickup], ctx({ items: [variantLine], cartSubtotal: 0 })),
            1150
        );
    });

    it('returns 0 quote plus pickup for non-finite quotes', () => {
        assert.equal(applyCheckoutPricing(Number.NaN, [pickup], ctx()), 150);
    });

    it('matches destination include and exclude', () => {
        const japan: CommissionRule = {
            id: 'jp',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 200,
            feeLabel: 'Japan pickup',
            conditions: [{ type: 'destination_country', countries: ['JP'] }],
        };
        const notJapan: CommissionRule = {
            ...japan,
            id: 'not-jp',
            feeValue: 50,
            conditions: [{ type: 'destination_country', countries: ['JP'], excludeCountries: true }],
        };

        assert.equal(applyCheckoutPricing(1000, [japan], ctx({ destinationCountry: 'JP' })), 1200);
        assert.equal(applyCheckoutPricing(1000, [japan], ctx({ destinationCountry: 'TH' })), 1000);
        assert.equal(applyCheckoutPricing(1000, [notJapan], ctx({ destinationCountry: 'TH' })), 1050);
        assert.equal(applyCheckoutPricing(1000, [notJapan], ctx({ destinationCountry: 'JP' })), 1000);
    });

    it('matches packed weight and item quantity ranges', () => {
        const heavy: CommissionRule = {
            id: 'heavy',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 80,
            feeLabel: 'Heavy',
            conditions: [{ type: 'weight_range', minKg: 2, maxKg: 0 }],
        };
        const qty: CommissionRule = {
            id: 'qty',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 25,
            feeLabel: 'Qty',
            conditions: [{ type: 'item_quantity', minQuantity: 3, maxQuantity: 5 }],
        };

        assert.equal(applyCheckoutPricing(1000, [heavy], ctx({ cartWeightKg: 2 })), 1080);
        assert.equal(applyCheckoutPricing(1000, [heavy], ctx({ cartWeightKg: 1 })), 1000);
        assert.equal(applyCheckoutPricing(1000, [qty], ctx({ itemQuantity: 4 })), 1025);
        assert.equal(applyCheckoutPricing(1000, [qty], ctx({ itemQuantity: 2 })), 1000);
    });

    it('applies service-specific markup', () => {
        const express: CommissionRule = {
            id: 'express',
            conditionType: 'subtotal_range',
            feeType: 'quote_percentage',
            feeValue: 10,
            feeLabel: 'Express markup',
            conditions: [{ type: 'shipping_service', serviceIds: ['flex_dap'] }],
        };

        assert.equal(applyCheckoutPricing(1000, [express], ctx({ serviceIds: ['flex_dap'] })), 1100);
        assert.equal(applyCheckoutPricing(1000, [express], ctx({ serviceIds: ['prime_ddp'] })), 1000);
    });

    it('matches stored service names to checkout courier slugs', () => {
        const express: CommissionRule = {
            id: 'express',
            conditionType: 'subtotal_range',
            feeType: 'quote_percentage',
            feeValue: 10,
            feeLabel: 'Express markup',
            conditions: [
                {
                    type: 'shipping_service',
                    serviceIds: ['12', 'thai_nexus_express_flex_dap'],
                },
            ],
        };

        assert.equal(applyCheckoutPricing(1000, [express], ctx({ serviceIds: ['flex_dap'] })), 1100);
        assert.equal(
            applyCheckoutPricing(1000, [express], ctx({
                serviceIds: ['Thai Nexus Express Flex DAP'],
            })),
            1100
        );
        assert.equal(applyCheckoutPricing(1000, [express], ctx({ serviceIds: ['prime_ddp'] })), 1000);
    });

    it('treats inverted min/max ranges as a closed interval', () => {
        const band: CommissionRule = {
            id: 'band',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 40,
            feeLabel: 'Band',
            conditions: [{ type: 'weight_range', minKg: 5, maxKg: 2 }],
        };

        assert.equal(applyCheckoutPricing(1000, [band], ctx({ cartWeightKg: 3 })), 1040);
        assert.equal(applyCheckoutPricing(1000, [band], ctx({ cartWeightKg: 1 })), 1000);
        assert.equal(applyCheckoutPricing(1000, [band], ctx({ cartWeightKg: 6 })), 1000);
    });

    it('scales pickup per item and per kg', () => {
        const perItem: CommissionRule = {
            id: 'per-item',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 20,
            pickupUnit: 'per_item',
            feeLabel: 'Per item',
        };
        const perKg: CommissionRule = {
            id: 'per-kg',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 30,
            pickupUnit: 'per_kg',
            feeLabel: 'Per kg',
        };

        assert.equal(
            applyCheckoutPricing(1000, [perItem], ctx({ itemQuantity: 3, items: [{ ...item, quantity: 3 }] })),
            1060
        );
        assert.equal(applyCheckoutPricing(1000, [perKg], ctx({ cartWeightKg: 2 })), 1060);
    });

    it('stops later rules when stopProcessing matches', () => {
        const first: CommissionRule = {
            ...mixed,
            id: 'jp-mixed',
            stopProcessing: true,
            conditions: [{ type: 'destination_country', countries: ['JP'] }],
        };

        assert.equal(
            applyCheckoutPricing(1000, [first, pickup], ctx({ destinationCountry: 'JP' })),
            1322.5
        );
        assert.equal(
            applyCheckoutPricing(1000, [first, pickup], ctx({ destinationCountry: 'TH' })),
            1150
        );
    });

    it('ignores conditional rules in basic mode', () => {
        const japan: CommissionRule = {
            id: 'jp',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 200,
            feeLabel: 'Japan',
            conditions: [{ type: 'destination_country', countries: ['JP'] }],
        };

        assert.equal(
            applyCheckoutPricing(1000, [mixed, japan], ctx({ destinationCountry: 'JP' }), {
                pricingMode: 'basic',
            }),
            1322.5
        );
        assert.equal(
            applyCheckoutPricing(1000, [mixed, japan], ctx({ destinationCountry: 'JP' })),
            1552.5
        );
    });

    it('ANDs multiple conditions on one rule', () => {
        const both: CommissionRule = {
            id: 'and',
            conditionType: 'subtotal_range',
            feeType: 'fixed',
            feeValue: 90,
            feeLabel: 'JP heavy',
            conditions: [
                { type: 'destination_country', countries: ['JP'] },
                { type: 'weight_range', minKg: 2 },
            ],
        };

        assert.equal(
            applyCheckoutPricing(1000, [both], ctx({ destinationCountry: 'JP', cartWeightKg: 2 })),
            1090
        );
        assert.equal(
            applyCheckoutPricing(1000, [both], ctx({ destinationCountry: 'JP', cartWeightKg: 1 })),
            1000
        );
    });
});

describe('commissionRuleIsAlwaysOn', () => {
    it('treats empty conditions as always-on', () => {
        assert.equal(commissionRuleIsAlwaysOn(mixed), true);
    });

    it('treats destination rules as advanced', () => {
        assert.equal(
            commissionRuleIsAlwaysOn({
                ...mixed,
                conditions: [{ type: 'destination_country', countries: ['JP'] }],
            }),
            false
        );
    });
});

describe('calculateTotalCommission', () => {
    it('still sums additive fees when quote is zero', () => {
        assert.equal(calculateTotalCommission([pickup], ctx()), 150);
    });
});

describe('sanitizeCommissionRules', () => {
    it('persists mixed pickup and markupPercent', () => {
        const out = sanitizeCommissionRules([mixed]);

        assert.equal(out.length, 1);
        assert.equal(out[0].feeType, 'mixed');
        assert.equal(out[0].feeValue, 150);
        assert.equal(out[0].markupPercent, 15);
    });

    it('keeps markup-only rules that have feeValue as percent', () => {
        const out = sanitizeCommissionRules([markup]);

        assert.equal(out.length, 1);
        assert.equal(out[0].feeType, 'quote_percentage');
        assert.equal(out[0].feeValue, 15);
    });

    it('persists conditions, pickupUnit, and stopProcessing', () => {
        const out = sanitizeCommissionRules([
            {
                id: 'adv',
                conditionType: 'subtotal_range',
                feeType: 'fixed',
                feeValue: 40,
                pickupUnit: 'per_kg',
                stopProcessing: true,
                feeLabel: 'Heavy JP',
                conditions: [
                    { type: 'destination_country', countries: ['jp'] },
                    { type: 'weight_range', minKg: 3 },
                ],
            },
        ]);

        assert.equal(out.length, 1);
        assert.equal(out[0].pickupUnit, 'per_kg');
        assert.equal(out[0].stopProcessing, true);
        assert.deepEqual(out[0].conditions, [
            { type: 'destination_country', countries: ['JP'] },
            { type: 'weight_range', minKg: 3, maxKg: 0 },
        ]);
    });

    it('swaps inverted ranges and drops negatives', () => {
        const out = sanitizeCommissionRules([
            {
                id: 'band',
                conditionType: 'subtotal_range',
                feeType: 'fixed',
                feeValue: 10,
                feeLabel: 'Band',
                conditions: [
                    { type: 'weight_range', minKg: 5, maxKg: 2 },
                    { type: 'item_quantity', minQuantity: -2, maxQuantity: 4.6 },
                ],
            },
        ]);

        assert.deepEqual(out[0].conditions, [
            { type: 'weight_range', minKg: 2, maxKg: 5 },
            { type: 'item_quantity', minQuantity: 0, maxQuantity: 5 },
        ]);
    });
});

describe('sanitizePricingMode', () => {
    it('keeps basic and advanced, drops unknown', () => {
        assert.equal(sanitizePricingMode('basic'), 'basic');
        assert.equal(sanitizePricingMode('advanced'), 'advanced');
        assert.equal(sanitizePricingMode('other'), undefined);
    });
});
