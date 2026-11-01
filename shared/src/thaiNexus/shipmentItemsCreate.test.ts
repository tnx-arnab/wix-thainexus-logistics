import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    ensureMinimumDeclaredValue,
    HS_CODE_FALLBACK,
    normalizeShipmentItemDescription,
    sanitizeShipmentItemsForApi,
    validateShipmentItemsForCreate,
} from './shipmentItemsCreate.js';

describe('shipmentItemsCreate', () => {
    it('normalizeShipmentItemDescription pads short names', () => {
        assert.equal(normalizeShipmentItemDescription('AB'), 'AB.');
        assert.equal(normalizeShipmentItemDescription('Widget'), 'Widget');
    });

    it('ensureMinimumDeclaredValue bumps zero', () => {
        assert.equal(ensureMinimumDeclaredValue(0), 0.01);
        assert.equal(ensureMinimumDeclaredValue(50), 50);
    });

    it('sanitizeShipmentItemsForApi applies HS fallback and min declared value', () => {
        const rows = sanitizeShipmentItemsForApi([
            {
                description: 'AB',
                quantity: 1,
                declared_value: 0,
                country_of_origin: 'TH',
            },
        ]);
        assert.equal(rows[0].description, 'AB.');
        assert.equal(rows[0].hs_code, HS_CODE_FALLBACK);
        assert.equal(rows[0].declared_value, 0.01);
        assert.equal(validateShipmentItemsForCreate(rows), null);
    });
});
