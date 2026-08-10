import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeCountryIso2,
    normalizeWixShippingDestination,
} from './wixShippingDestination.js';

test('normalizeWixShippingDestination unwraps nested address (Wix checkout)', () => {
    const dest = normalizeWixShippingDestination({
        address: {
            country: 'GB',
            subdivision: 'GB-ENG',
            city: 'London',
            postalCode: 'SW1W 9SH',
            addressLine: '123 Buckingham Palace Rd',
        },
        contactDetails: { firstName: 'Thai', lastName: 'Marketing' },
    });
    assert.equal(dest.country, 'GB');
    assert.equal(dest.city, 'London');
    assert.equal(dest.postalCode, 'SW1W 9SH');
    assert.equal(dest.subdivision, 'GB-ENG');
});

test('normalizeCountryIso2 maps GBR and UK', () => {
    assert.equal(normalizeCountryIso2('GBR'), 'GB');
    assert.equal(normalizeCountryIso2('UK'), 'GB');
    assert.equal(normalizeCountryIso2('US'), 'US');
});
