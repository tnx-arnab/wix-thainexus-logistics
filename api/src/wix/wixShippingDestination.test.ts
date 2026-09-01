import assert from 'node:assert/strict';
import test from 'node:test';
import {
    lineHsCode,
    lineOriginCountry,
    lineUnitDeclaredValue,
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

test('lineUnitDeclaredValue prefers unit price over line total', () => {
    assert.equal(
        lineUnitDeclaredValue({
            quantity: 2,
            price: { amount: '250' },
            totalPrice: { amount: '500' },
        }),
        250
    );
    assert.equal(lineUnitDeclaredValue({ quantity: 2, totalPrice: '400' }), 200);
});

test('lineHsCode and lineOriginCountry read customs fields', () => {
    assert.equal(
        lineHsCode({ physicalProperties: { hs_code: '6109.10' } }),
        '6109.10'
    );
    assert.equal(lineOriginCountry({ countryOfOrigin: 'THA' }), 'TH');
    assert.equal(lineOriginCountry({}), 'TH');
});
