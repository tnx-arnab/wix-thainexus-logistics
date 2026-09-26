import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkerDb, clearWorkerDb, saveOrderShipments } from '@thai-nexus/shared';
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
`;

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
