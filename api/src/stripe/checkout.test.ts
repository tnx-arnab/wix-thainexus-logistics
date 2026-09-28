import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkerDb, clearWorkerDb, encryptSecret, findOrderShipmentByRequestNumber, getDb, saveOrderShipments, setStore } from '@thai-nexus/shared';
import { createMigratedMemoryD1 } from '../../../shared/src/d1/memoryD1.js';
import { checkoutIntegrationId, recordPaidCheckoutSession } from './checkout.js';
import type Stripe from 'stripe';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS order_shipments (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS thai_nexus_config (
    instance_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stores (
    instance_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL DEFAULT '',
    site_id TEXT,
    meta_site_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111';

function longLivedToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: 4_000_000_000 })).toString('base64url');
    return `${header}.${payload}.sig`;
}

async function seedApiToken(instanceId: string): Promise<void> {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    await getDb()
        .prepare(
            `INSERT INTO thai_nexus_config (instance_id, data, updated_at) VALUES (?, ?, ?)`
        )
        .bind(
            instanceId,
            JSON.stringify({ apiTokenEncrypted: encryptSecret('tnx-token') }),
            new Date().toISOString()
        )
        .run();
}

function paidSession(amountTotal = 10000): Stripe.Checkout.Session {
    return {
        id: 'cs_test',
        payment_status: 'paid',
        amount_total: amountTotal,
        metadata: { instance_id: INSTANCE_ID, request_number: 'REQ-9', order_id: '55' },
        payment_intent: 'pi_test',
    } as Stripe.Checkout.Session;
}

async function seedShipment(extra: Record<string, unknown> = {}): Promise<void> {
    await saveOrderShipments({
        orderId: '55',
        instanceId: INSTANCE_ID,
        requestNumbers: ['REQ-9'],
        shipments: [
            {
                request_number: 'REQ-9',
                api_price_thb: 100,
                payment_status: 'unpaid',
                status: 'pending',
                ...extra,
            },
        ],
        createdAt: new Date().toISOString(),
        shipping_amount: 100,
        shipping_currency: 'THB',
    });
}

test('checkout integration id ends with 8 letters', () => {
    const id = checkoutIntegrationId('REQ-9');
    assert.match(id, /^tnx_boxpay_[a-z]{8}$/);
    assert.equal(checkoutIntegrationId('REQ-9'), id);
});

test('paid webhook rejects a charge that is not the raw API price', async () => {
    bindWorkerDb(createMigratedMemoryD1(SCHEMA));
    await saveOrderShipments({
        orderId: '55',
        instanceId: 'inst-1',
        requestNumbers: ['REQ-9'],
        shipments: [
            {
                request_number: 'REQ-9',
                api_price_thb: 100,
                payment_status: 'unpaid',
            },
        ],
        createdAt: new Date().toISOString(),
        shipping_amount: 250,
        shipping_currency: 'THB',
    });

    const session = {
        id: 'cs_test',
        payment_status: 'paid',
        amount_total: 25000,
        metadata: { instance_id: 'inst-1', request_number: 'REQ-9', order_id: '55' },
        payment_intent: 'pi_test',
    } as Stripe.Checkout.Session;

    try {
        const result = await recordPaidCheckoutSession(session);
        assert.equal(result.ok, false);
        assert.match(result.error || '', /raw API price/);
    } finally {
        clearWorkerDb();
    }
});

test('paid webhook reports the shipment and stores ready_to_ship', async () => {
    bindWorkerDb(createMigratedMemoryD1(SCHEMA));
    await seedApiToken(INSTANCE_ID);
    await seedShipment();
    await setStore({
        instance_id: INSTANCE_ID,
        access_token: longLivedToken(),
        scope: 'wix',
        user: { id: 'owner', email: 'merchant@wix.com' },
    });

    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        calls.push({ url, body });
        if (url.includes('wixShipmentPayment')) {
            return new Response(JSON.stringify({ success: true, shipment_status: 'ready_to_ship' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        const result = await recordPaidCheckoutSession(paidSession());
        assert.equal(result.ok, true);
        assert.equal(result.billingOk, true);

        const paymentCall = calls.find((call) => call.url.includes('wixShipmentPayment'));
        assert.ok(paymentCall);
        assert.equal(paymentCall.body.api_token, 'tnx-token');
        assert.equal(paymentCall.body.request_number, 'REQ-9');
        assert.equal(paymentCall.body.payment_status, 'confirmed');
        assert.equal(paymentCall.body.payment_method, 'stripe');
        assert.equal(paymentCall.body.amount, 100);
        assert.equal(paymentCall.body.currency, 'THB');
        assert.equal(paymentCall.body.stripe_payment_intent_id, 'pi_test');
        assert.equal(paymentCall.body.stripe_session_id, 'cs_test');

        const saved = await findOrderShipmentByRequestNumber(INSTANCE_ID, 'REQ-9');
        const row = saved?.shipments?.find((item) => item.request_number === 'REQ-9');
        assert.equal(row?.status, 'ready_to_ship');
        assert.equal(row?.payment_status, 'paid');
        assert.ok(row?.tnx_payment_reported_at);
        assert.ok(row?.wix_billing_reported_at);
    } finally {
        globalThis.fetch = original;
        clearWorkerDb();
    }
});

test('billing already reported still reports the Thai Nexus payment once', async () => {
    bindWorkerDb(createMigratedMemoryD1(SCHEMA));
    await seedApiToken(INSTANCE_ID);
    await seedShipment({
        payment_status: 'paid',
        wix_billing_reported_at: '2026-09-28T01:50:32.633Z',
        stripe_payment_intent_id: 'pi_test',
        paid_at: '2026-09-28T01:50:30.169Z',
    });

    let paymentCalls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes('wixShipmentPayment')) {
            paymentCalls += 1;
            return new Response(JSON.stringify({ success: true, shipment_status: 'ready_to_ship' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        throw new Error(`unexpected fetch ${url}`);
    };

    try {
        const first = await recordPaidCheckoutSession(paidSession());
        const second = await recordPaidCheckoutSession(paidSession());
        assert.equal(first.ok, true);
        assert.equal(first.billingOk, true);
        assert.equal(second.ok, true);
        assert.equal(second.already, true);
        assert.equal(paymentCalls, 1);

        const saved = await findOrderShipmentByRequestNumber(INSTANCE_ID, 'REQ-9');
        const row = saved?.shipments?.find((item) => item.request_number === 'REQ-9');
        assert.equal(row?.status, 'ready_to_ship');
        assert.ok(row?.tnx_payment_reported_at);
    } finally {
        globalThis.fetch = original;
        clearWorkerDb();
    }
});

test('failed Thai Nexus payment stays retryable', async () => {
    bindWorkerDb(createMigratedMemoryD1(SCHEMA));
    await seedApiToken(INSTANCE_ID);
    await seedShipment();

    const original = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response(JSON.stringify({ success: false, error: 'Shipment not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });

    try {
        const result = await recordPaidCheckoutSession(paidSession());
        assert.equal(result.ok, false);
        assert.match(result.error || '', /Shipment not found/);

        const saved = await findOrderShipmentByRequestNumber(INSTANCE_ID, 'REQ-9');
        const row = saved?.shipments?.find((item) => item.request_number === 'REQ-9');
        assert.equal(row?.tnx_payment_reported_at, undefined);
        assert.equal(row?.wix_billing_reported_at, undefined);
    } finally {
        globalThis.fetch = original;
        clearWorkerDb();
    }
});
