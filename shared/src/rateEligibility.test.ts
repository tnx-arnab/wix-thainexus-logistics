import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    itemHasMeasurements,
    mergeShippingEligibleFlags,
    parseShippingEligibleMetafield,
    validateAllProductsEligible,
    validateCartMeasurements,
    validateDestination,
    validateRateRequest,
    validateStoreReadyForRates,
} from './rateEligibility.js';
import type { BcRateItem, ShipperProfile, StoreConfig } from './types/thaiNexus.js';

const completeItem = (overrides: Partial<BcRateItem> = {}): BcRateItem => ({
    product_id: '101',
    name: 'Sample product',
    quantity: 1,
    length: { units: 'cm', value: 20 },
    width: { units: 'cm', value: 15 },
    height: { units: 'cm', value: 10 },
    weight: { units: 'kg', value: 0.5 },
    ...overrides,
});

const shipper: ShipperProfile = {
    name: 'Store',
    phone: '+66000000000',
    street: '123 Road',
    city: 'Bangkok',
    state: 'BKK',
    postalCode: '10110',
    country: 'TH',
};

const config: StoreConfig = {
    shipper,
    commissionRules: [],
    boxes: [
        {
            id: 'box_1',
            name: 'Medium',
            innerLengthCm: 40,
            innerWidthCm: 30,
            innerDepthCm: 20,
            maxWeightKg: 10,
            emptyWeightKg: 0.2,
        },
    ],
};

describe('validateDestination', () => {
    it('requires country, postal code, and city', () => {
        assert.equal(
            validateDestination({ country_iso2: 'TH' }),
            'Complete the shipping postal code before Thai Nexus rates are available.'
        );
        assert.equal(
            validateDestination({ country_iso2: 'TH', zip: '10110' }),
            'Complete the shipping city before Thai Nexus rates are available.'
        );
        assert.equal(validateDestination({ country_iso2: 'TH', zip: '10110', city: 'Bangkok' }), null);
    });
});

describe('validateCartMeasurements', () => {
    it('rejects items missing weight or dimensions', () => {
        assert.equal(
            validateCartMeasurements([completeItem({ weight: undefined })]),
            '"Sample product" is missing weight or dimensions - Thai Nexus rates are hidden until every product has them.'
        );
    });

    it('accepts fully measured items', () => {
        assert.equal(validateCartMeasurements([completeItem()]), null);
    });
});

describe('itemHasMeasurements', () => {
    it('rejects zero or missing values', () => {
        assert.equal(itemHasMeasurements(completeItem({ length: { units: 'cm', value: 0 } })), false);
        assert.equal(itemHasMeasurements(completeItem()), true);
    });
});

describe('validateAllProductsEligible', () => {
    it('defaults missing metafields to eligible', () => {
        assert.equal(validateAllProductsEligible([completeItem()], {}), null);
    });

    it('blocks when any product is explicitly ineligible', () => {
        const message = validateAllProductsEligible([completeItem()], { '101': false });
        assert.match(message || '', /not enabled for Thai Nexus shipping/);
    });

    it('requires product ids on every line', () => {
        assert.match(
            validateAllProductsEligible([completeItem({ product_id: undefined })], {}) || '',
            /product id/
        );
    });
});

describe('validateStoreReadyForRates', () => {
    it('requires token, shipper, and boxes', () => {
        assert.match(validateStoreReadyForRates(config, false) || '', /API token/);
        assert.match(
            validateStoreReadyForRates({ ...config, boxes: [] }, true) || '',
            /shipping box/
        );
        assert.equal(validateStoreReadyForRates(config, true), null);
    });

    it('skips box requirement when requireBoxes is false', () => {
        assert.equal(
            validateStoreReadyForRates({ ...config, boxes: [] }, true, { requireBoxes: false }),
            null
        );
    });
});

describe('validateRateRequest', () => {
    it('returns the first blocking issue', () => {
        const message = validateRateRequest({
            destination: { country_iso2: 'TH' },
            items: [completeItem()],
            config,
            hasToken: true,
            eligibleByProductId: { '101': false },
        });
        assert.match(message || '', /postal code|not enabled/);
    });

    it('passes when everything is ready', () => {
        assert.equal(
            validateRateRequest({
                destination: { country_iso2: 'TH', zip: '10110', city: 'Bangkok' },
                items: [completeItem()],
                config,
                hasToken: true,
                eligibleByProductId: {},
            }),
            null
        );
    });

    it('allows boxed single-product carts without merchant boxes configured', () => {
        assert.equal(
            validateRateRequest({
                destination: { country_iso2: 'TH', zip: '10110', city: 'Bangkok' },
                items: [completeItem()],
                config: { ...config, boxes: [] },
                hasToken: true,
                eligibleByProductId: {},
                boxedProductFlags: { '101': true },
            }),
            null
        );
    });
});

describe('parseShippingEligibleMetafield', () => {
    it('treats absent or true values as eligible', () => {
        assert.equal(parseShippingEligibleMetafield(undefined), true);
        assert.equal(parseShippingEligibleMetafield('true'), true);
    });

    it('treats explicit false values as ineligible', () => {
        assert.equal(parseShippingEligibleMetafield(false), false);
        assert.equal(parseShippingEligibleMetafield('false'), false);
    });
});

describe('mergeShippingEligibleFlags', () => {
    it('marks config exclusions as ineligible', () => {
        const merged = mergeShippingEligibleFlags({ '10': true }, [99]);
        assert.equal(merged['99'], false);
    });
});
