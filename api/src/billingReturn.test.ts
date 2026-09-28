import assert from 'node:assert/strict';
import test from 'node:test';
import { billingReturnHtml } from './billingReturn.js';

test('paid Stripe return names the shipment', () => {
    const html = billingReturnHtml(
        new URL('https://wix.thainexus.co.th/?billing=paid&request_number=SR-F446ER')
    );
    assert.ok(html);
    assert.match(html, /Payment received/);
    assert.match(html, /SR-F446ER/);
    assert.doesNotMatch(html, /<h1>404<\/h1>/);
});

test('cancelled Stripe return is a page, not a 404', () => {
    const html = billingReturnHtml(
        new URL('https://wix.thainexus.co.th/?billing=cancel&request_number=SR-F446ER')
    );
    assert.ok(html);
    assert.match(html, /Payment cancelled/);
    assert.match(html, /No payment was taken/);
});

test('public root and unsafe request numbers stay closed', () => {
    assert.equal(billingReturnHtml(new URL('https://wix.thainexus.co.th/')), null);
    assert.equal(
        billingReturnHtml(new URL('https://wix.thainexus.co.th/?billing=other')),
        null
    );
    const html = billingReturnHtml(
        new URL('https://wix.thainexus.co.th/?billing=paid&request_number=%3Cscript%3E')
    );
    assert.ok(html);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /Shipment &lt;script&gt;/);
});
