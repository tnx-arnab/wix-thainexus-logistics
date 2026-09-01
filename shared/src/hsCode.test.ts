import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractHsCodeFromRecord,
    extractHsCodeFromText,
    normalizeHsCode,
} from './hsCode.js';

test('normalizeHsCode strips separators and keeps 6-10 digits', () => {
    assert.equal(normalizeHsCode('6109.10'), '610910');
    assert.equal(normalizeHsCode('1806 90'), '180690');
    assert.equal(normalizeHsCode('392690'), '392690');
    assert.equal(normalizeHsCode('12.34'), '');
    assert.equal(normalizeHsCode(''), '');
});

test('extractHsCodeFromText reads a labeled code in product copy', () => {
    assert.equal(extractHsCodeFromText('HS Code: 1806.90'), '180690');
    assert.equal(extractHsCodeFromText('Chocolate bites, 80g'), '');
});

test('extractHsCodeFromRecord reads Wix product info sections and line fields', () => {
    assert.equal(
        extractHsCodeFromRecord({
            additionalInfoSections: [{ title: 'HS Code', description: '1806.90' }],
        }),
        '180690'
    );
    assert.equal(
        extractHsCodeFromRecord({
            physicalProperties: { hs_code: '6109.10' },
        }),
        '610910'
    );
    assert.equal(
        extractHsCodeFromRecord({
            customTextFields: [{ title: 'Tariff code', value: '170490' }],
        }),
        '170490'
    );
    assert.equal(extractHsCodeFromRecord({ sku: 'WCB-001' }), '');
});

test('fillMissingItemHsCodes keeps existing codes and suggests the rest', async () => {
    const { fillMissingItemHsCodes } = await import('./thaiNexus/shipments.js');
    const items = await fillMissingItemHsCodes(
        [
            { name: 'WHITE CHOCOLATE BITES', quantity: 1 },
            { name: 'Shoe box', quantity: 1, hs_code: '6404.19' },
        ],
        'VN',
        async (description) => (description.includes('CHOCOLATE') ? '180690' : '999999')
    );
    assert.equal(items[0].hs_code, '180690');
    assert.equal(items[1].hs_code, '640419');
});
