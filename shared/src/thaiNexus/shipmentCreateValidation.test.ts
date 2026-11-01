import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    clampActualWeightKgForApi,
    clampDimensionCmForApi,
    finalizeAddressForShipmentCreate,
    normalizeCountryIso2,
    resolveRequiredCity,
    validateConsigneeForCreate,
} from './shipmentCreateValidation.js';
import { toApiShipmentItemRows } from './shipmentItemsCreate.js';

describe('shipmentCreateValidation', () => {
    it('resolveRequiredCity falls back through state and postal', () => {
        assert.equal(resolveRequiredCity('', 'Bangkok', ''), 'Bangkok');
        assert.equal(resolveRequiredCity('', '', '10110'), '10110');
        assert.equal(resolveRequiredCity('', '', ''), 'N/A');
    });

    it('finalizeAddressForShipmentCreate fills missing city and country', () => {
        const row = finalizeAddressForShipmentCreate(
            {
                name: 'Jane',
                phone: '1',
                address_line1: '123 Main',
                city: '',
                state: 'NY',
                postal_code: '10001',
                country: 'US',
            },
            { defaultCountry: 'US' }
        );
        assert.equal(row.city, 'NY');
        assert.equal(row.country, 'US');
        assert.equal(validateConsigneeForCreate(row), null);
    });

    it('normalizeCountryIso2 resolves ISO3 and names', () => {
        assert.equal(normalizeCountryIso2('US'), 'US');
        assert.equal(normalizeCountryIso2('USA'), 'US');
        assert.equal(normalizeCountryIso2('United States'), 'US');
    });

    it('clampDimensionCmForApi enforces minimum 1 cm', () => {
        assert.equal(clampDimensionCmForApi(0), 1);
        assert.equal(clampDimensionCmForApi(0.5), 1);
        assert.equal(clampDimensionCmForApi(30), 30);
    });

    it('clampActualWeightKgForApi enforces minimum 0.01 kg', () => {
        assert.equal(clampActualWeightKgForApi(0), 0.01);
        assert.equal(clampActualWeightKgForApi(0.5), 0.5);
    });

    it('toApiShipmentItemRows strips extra fields', () => {
        const rows = toApiShipmentItemRows([
            {
                description: 'Widget',
                quantity: 2,
                declared_value: 10,
                hs_code: '851822',
                country_of_origin: 'TH',
                currency_code: 'THB',
            },
        ]);
        assert.deepEqual(Object.keys(rows[0]).sort(), [
            'country_of_origin',
            'declared_value',
            'description',
            'hs_code',
            'quantity',
        ]);
    });
});
