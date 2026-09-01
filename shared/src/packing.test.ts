import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { packBoxedSingleItemCart, packItems } from './packing.js';
import type { BcRateItem, ShippingBox } from './types/thaiNexus.js';

const merchantBox: ShippingBox = {
    id: 'medium',
    name: 'Medium',
    innerLengthCm: 40,
    innerWidthCm: 30,
    innerDepthCm: 20,
    maxWeightKg: 10,
    emptyWeightKg: 0.2,
};

function phoneCaseItem(overrides: Partial<BcRateItem> = {}): BcRateItem {
    return {
        product_id: '101',
        name: 'Phone case',
        quantity: 1,
        length: { units: 'cm', value: 18 },
        width: { units: 'cm', value: 10 },
        height: { units: 'cm', value: 3 },
        weight: { units: 'kg', value: 0.15 },
        discounted_price: { currency: 'THB', amount: '250' },
        ...overrides,
    };
}

describe('packBoxedSingleItemCart', () => {
    it('returns retail parcels for a single boxed product line', () => {
        const result = packBoxedSingleItemCart([phoneCaseItem()], {}, { '101': true });

        assert.ok(result);
        assert.equal(result.boxes.length, 1);
        assert.equal(result.boxes[0].length, 18);
        assert.equal(result.boxes[0].width, 10);
        assert.equal(result.boxes[0].height, 3);
        assert.equal(result.boxes[0].weight, 0.15);
        assert.equal(result.boxes[0].boxId, 'retail_box');
        assert.equal(result.boxes[0].boxName, 'Retail box');
    });

    it('creates one parcel per unit when quantity is greater than one', () => {
        const result = packBoxedSingleItemCart(
            [phoneCaseItem({ quantity: 3 })],
            {},
            { '101': true }
        );

        assert.ok(result);
        assert.equal(result.boxes.length, 3);
        assert.ok(result.boxes.every((b) => b.weight === 0.15));
    });

    it('returns null for multi-line carts with different products even when boxed', () => {
        const result = packBoxedSingleItemCart(
            [phoneCaseItem(), phoneCaseItem({ product_id: '102', name: 'Shoe box' })],
            {},
            { '101': true, '102': true }
        );

        assert.equal(result, null);
    });

    it('uses retail dims when multiple lines share one boxed product', () => {
        const result = packBoxedSingleItemCart(
            [phoneCaseItem({ quantity: 1 }), phoneCaseItem({ quantity: 2 })],
            {},
            { '101': true }
        );

        assert.ok(result);
        assert.equal(result.boxes.length, 3);
        assert.ok(result.boxes.every((b) => b.boxId === 'retail_box'));
        assert.equal(result.boxes[0].length, 18);
    });

    it('returns null when the sole product is not flagged boxed', () => {
        const result = packBoxedSingleItemCart([phoneCaseItem()], {}, {});

        assert.equal(result, null);
    });

    it('errors when a boxed product is missing dimensions', () => {
        const result = packBoxedSingleItemCart(
            [phoneCaseItem({ length: undefined })],
            {},
            { '101': true }
        );

        assert.ok(result);
        assert.equal(result.boxes.length, 0);
        assert.match(result.errors[0], /boxed product/i);
    });
});

describe('packItems boxed integration', () => {
    it('uses retail packaging for a single-item boxed cart', () => {
        const packing = packItems([phoneCaseItem()], [merchantBox], {}, {
            boxedProductFlags: { '101': true },
        });

        assert.equal(packing.boxes.length, 1);
        assert.equal(packing.boxes[0].boxId, 'retail_box');
        assert.equal(packing.boxes[0].length, 18);
    });

    it('falls back to merchant boxes for multi-item carts', () => {
        const packing = packItems(
            [
                phoneCaseItem(),
                phoneCaseItem({
                    product_id: '102',
                    name: 'Shoe box',
                    length: { units: 'cm', value: 30 },
                    width: { units: 'cm', value: 20 },
                    height: { units: 'cm', value: 12 },
                    weight: { units: 'kg', value: 0.8 },
                }),
            ],
            [merchantBox],
            {},
            { boxedProductFlags: { '101': true, '102': true } }
        );

        assert.equal(packing.boxes.length, 1);
        assert.equal(packing.boxes[0].boxId, 'medium');
        assert.equal(packing.boxes[0].length, 40);
    });

    it('uses merchant boxes when boxed flag is off', () => {
        const packing = packItems([phoneCaseItem()], [merchantBox], {}, {
            boxedProductFlags: {},
        });

        assert.equal(packing.boxes[0].boxId, 'medium');
        assert.equal(packing.boxes[0].length, 40);
    });

    it('records shipment items with qty and declared value', () => {
        const packing = packItems(
            [
                phoneCaseItem({ quantity: 2 }),
                phoneCaseItem({
                    product_id: '102',
                    name: 'Shoe box',
                    quantity: 1,
                    discounted_price: { currency: 'THB', amount: '800' },
                    hs_code: '6404.19',
                    country_of_origin: 'TH',
                    length: { units: 'cm', value: 30 },
                    width: { units: 'cm', value: 20 },
                    height: { units: 'cm', value: 12 },
                    weight: { units: 'kg', value: 0.8 },
                }),
            ],
            [merchantBox]
        );

        assert.equal(packing.boxes.length, 1);
        const items = packing.boxes[0].shipmentItems;
        const phone = items.find((i) => i.description === 'Phone case');
        const shoe = items.find((i) => i.description === 'Shoe box');
        assert.equal(phone?.quantity, 2);
        assert.equal(phone?.declared_value, 250);
        assert.equal(shoe?.quantity, 1);
        assert.equal(shoe?.declared_value, 800);
        assert.equal(shoe?.hs_code, '640419');
        assert.equal(shoe?.country_of_origin, 'TH');
    });

    it('fails when an item does not fit any configured box', () => {
        const oversized = phoneCaseItem({
            length: { units: 'cm', value: 100 },
            width: { units: 'cm', value: 100 },
            height: { units: 'cm', value: 100 },
            weight: { units: 'kg', value: 50 },
        });

        const packing = packItems([oversized], [merchantBox], {});

        assert.equal(packing.boxes.length, 0);
        assert.ok(packing.errors.some((e) => /does not fit|could not be packed/i.test(e)));
    });
});
