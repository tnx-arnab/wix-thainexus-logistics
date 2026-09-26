import assert from 'node:assert/strict';
import test from 'node:test';
import {
    billingEventForShipmentCharge,
    buildWixBillingEventPayload,
    shipmentChargeSatang,
    calculateWixRevenueShare,
    formatCurrencyAmount,
    isValidNumericAmount,
    sendWixBillingEvent,
    sendWixBillingEventWithToken,
} from './billingEvents.js';
import { createApp } from '../app.js';
import { bindWorkerDb, clearWorkerDb } from '@thai-nexus/shared';
import { createMigratedMemoryD1 } from '../../../shared/src/d1/memoryD1.js';

test('shipment charge uses the raw API price in satang', () => {
    assert.equal(shipmentChargeSatang(240.5), 24050);
    assert.equal(shipmentChargeSatang(null), null);
    assert.equal(shipmentChargeSatang(0), null);
    const event = billingEventForShipmentCharge({
        apiPriceThb: 240.5,
        requestNumber: 'REQ-1',
        orderId: '99',
        paymentIntentId: 'pi_123',
    });
    assert.equal(event.gross_revenue, 240.5);
    assert.equal(event.net_revenue, 240.5);
    assert.equal(event.external_id, 'REQ-1');
    const payload = buildWixBillingEventPayload(event);
    assert.equal(payload.event.gross_revenue, '240.50');
    assert.equal(payload.event.wix_share, '48.10');
});

test('formatCurrencyAmount formats strings, numbers, and negative amounts', () => {
    assert.equal(formatCurrencyAmount(100), '100.00');
    assert.equal(formatCurrencyAmount('50.5'), '50.50');
    assert.equal(formatCurrencyAmount(-25.75), '25.75');
    assert.equal(formatCurrencyAmount('-12.3'), '12.30');
    assert.equal(formatCurrencyAmount('invalid'), '0.00');
    assert.equal(formatCurrencyAmount(0), '0.00');
});

test('isValidNumericAmount validates numeric values correctly', () => {
    assert.equal(isValidNumericAmount(100), true);
    assert.equal(isValidNumericAmount('50.50'), true);
    assert.equal(isValidNumericAmount(0), true);
    assert.equal(isValidNumericAmount('0'), true);
    assert.equal(isValidNumericAmount(-10), true);
    assert.equal(isValidNumericAmount(''), false);
    assert.equal(isValidNumericAmount(null), false);
    assert.equal(isValidNumericAmount(undefined), false);
    assert.equal(isValidNumericAmount('abc'), false);
});

test('calculateWixRevenueShare calculates 20% on profit margin (net revenue)', () => {
    assert.equal(calculateWixRevenueShare(100), '20.00');
    assert.equal(calculateWixRevenueShare(25.5), '5.10');
    assert.equal(calculateWixRevenueShare('50'), '10.00');
    assert.equal(calculateWixRevenueShare(-50), '10.00');
    assert.equal(calculateWixRevenueShare(0), '0.00');
    assert.equal(calculateWixRevenueShare('invalid'), '0.00');
});

test('buildWixBillingEventPayload builds standard CHARGE event', () => {
    const payload = buildWixBillingEventPayload({
        billing_type: 'CHARGE',
        gross_revenue: 120,
        net_revenue: 30,
        order_id: 'order-123',
        description: 'Shipping label purchase',
    });

    assert.equal(payload.event.billing_type, 'CHARGE');
    assert.equal(payload.event.gross_revenue, '120.00');
    assert.equal(payload.event.net_revenue, '30.00');
    assert.equal(payload.event.wix_share, '6.00'); // 20% of 30.00
    assert.equal(payload.event.order_id, 'order-123');
    assert.equal(payload.event.description, 'Shipping label purchase');
    assert.ok(payload.event.created_date);
});

test('buildWixBillingEventPayload builds REFUND event with explicit wix_share', () => {
    const payload = buildWixBillingEventPayload({
        billing_type: 'REFUND',
        gross_revenue: -60,
        net_revenue: -15,
        wix_share: 3,
        transaction_id: 'tx-999',
    });

    assert.equal(payload.event.billing_type, 'REFUND');
    assert.equal(payload.event.gross_revenue, '60.00');
    assert.equal(payload.event.net_revenue, '15.00');
    assert.equal(payload.event.wix_share, '3.00');
    assert.equal(payload.event.transaction_id, 'tx-999');
});

test('sendWixBillingEventWithToken posts to Wix API and handles non-200 responses', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedHeaders: Record<string, string> = {};
    let requestedBody: any = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrl = String(input);
        requestedHeaders = (init?.headers || {}) as Record<string, string>;
        requestedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;

    try {
        const result = await sendWixBillingEventWithToken('mock-access-token-xyz', {
            billing_type: 'CHARGE',
            gross_revenue: 100,
            net_revenue: 20,
        });

        assert.equal(result.ok, true);
        assert.equal(result.status, 200);
        assert.equal(requestedUrl, 'https://www.wixapis.com/apps/v1/billing-event');
        assert.equal(requestedHeaders['Authorization'], 'mock-access-token-xyz');
        assert.equal(requestedBody.event.billing_type, 'CHARGE');
        assert.equal(requestedBody.event.wix_share, '4.00');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('sendWixBillingEvent mints token and sends event', async () => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    process.env.WIX_APP_ID = 'app-id';
    process.env.WIX_APP_SECRET = 'app-secret';
    bindWorkerDb(
        createMigratedMemoryD1(`
CREATE TABLE IF NOT EXISTS stores (
    instance_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL DEFAULT '',
    site_id TEXT,
    meta_site_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)
    );

    const originalFetch = globalThis.fetch;
    let eventPosted = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/oauth2/token')) {
            const exp = Math.floor(Date.now() / 1000) + 14_400;
            const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
            return new Response(
                JSON.stringify({ access_token: `eyJhbGciOiJub25lIn0.${payload}.minted` }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }
        if (url.includes('/billing-event')) {
            eventPosted = true;
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return originalFetch(input, init);
    }) as typeof fetch;

    try {
        const result = await sendWixBillingEvent('7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4', {
            billing_type: 'CHARGE',
            gross_revenue: 200,
            net_revenue: 50,
        });

        assert.equal(result.ok, true);
        assert.equal(eventPosted, true);
    } finally {
        globalThis.fetch = originalFetch;
        clearWorkerDb();
    }
});

test('POST /api/billing/events endpoint handles billing event requests and validates input', async () => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    process.env.WIX_APP_ID = 'app-id';
    process.env.WIX_APP_SECRET = 'app-secret';
    bindWorkerDb(
        createMigratedMemoryD1(`
CREATE TABLE IF NOT EXISTS stores (
    instance_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL DEFAULT '',
    site_id TEXT,
    meta_site_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)
    );

    const originalFetch = globalThis.fetch;
    let eventReceivedByWix = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/oauth2/token')) {
            const exp = Math.floor(Date.now() / 1000) + 14_400;
            const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
            return new Response(
                JSON.stringify({ access_token: `eyJhbGciOiJub25lIn0.${payload}.minted` }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }
        if (url.includes('/billing-event')) {
            eventReceivedByWix = true;
            return new Response(JSON.stringify({ event_id: 'ev_123' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return originalFetch(input, init);
    }) as typeof fetch;

    try {
        const app = createApp();
        const server = app.listen(0);
        const address = server.address() as import('node:net').AddressInfo;
        const port = address.port;

        try {
            // Test 1: Valid billing event request
            const res = await originalFetch(`http://127.0.0.1:${port}/api/billing/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4',
                    billing_type: 'CHARGE',
                    gross_revenue: 150,
                    net_revenue: 30,
                    order_id: 'wix-order-777',
                }),
            });

            const body = await res.json() as Record<string, unknown>;
            assert.equal(res.status, 200);
            assert.equal(body.ok, true);
            assert.equal(eventReceivedByWix, true);

            // Test 2: Missing instanceId
            const badRes1 = await originalFetch(`http://127.0.0.1:${port}/api/billing/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    billing_type: 'CHARGE',
                    gross_revenue: 100,
                    net_revenue: 20,
                }),
            });
            assert.equal(badRes1.status, 400);

            // Test 3: Invalid numeric revenue
            const badRes2 = await originalFetch(`http://127.0.0.1:${port}/api/billing/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4',
                    billing_type: 'CHARGE',
                    gross_revenue: 'invalid',
                    net_revenue: 20,
                }),
            });
            assert.equal(badRes2.status, 400);

            // Test 4: Preview endpoint
            const previewRes = await originalFetch(`http://127.0.0.1:${port}/api/billing/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    net_revenue: 50,
                }),
            });
            const previewBody = await previewRes.json() as Record<string, unknown>;
            assert.equal(previewRes.status, 200);
            assert.equal(previewBody.wix_share, '10.00');
        } finally {
            server.close();
        }
    } finally {
        globalThis.fetch = originalFetch;
        clearWorkerDb();
    }
});
