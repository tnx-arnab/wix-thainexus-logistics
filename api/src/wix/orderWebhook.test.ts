import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderWebhookBody, extractShippingMethod } from './orderWebhook.js';

test('order created (COD) allows NOT_PAID and unwraps createdEvent.entity', () => {
    const result = normalizeOrderWebhookBody({
        slug: 'created',
        createdEvent: {
            entity: {
                id: 'order-guid-1',
                number: '10133',
                paymentStatus: 'NOT_PAID',
                shippingInfo: {
                    carrierId: '253fa9c1-154a-4a3b-92e6-22de08ad44a2',
                    title: 'Prime DDP',
                    code: 'prime_ddp',
                },
                lineItems: [],
            },
        },
    });

    assert.equal(result.skipReason, undefined);
    const order = result.payload.order as Record<string, unknown>;
    assert.equal(order.id, 'order-guid-1');
    assert.equal(order.paymentStatus, 'NOT_PAID');
});

test('payment status updated still requires PAID', () => {
    const result = normalizeOrderWebhookBody({
        slug: 'payment_status_updated',
        actionEvent: {
            body: {
                order: { id: 'o1', paymentStatus: 'NOT_PAID' },
            },
        },
    });
    assert.equal(result.skipReason, 'not-paid');
});

test('order created skips canceled payment', () => {
    const result = normalizeOrderWebhookBody({
        slug: 'created',
        createdEvent: {
            entity: {
                id: 'o2',
                paymentStatus: 'CANCELED',
                lineItems: [],
            },
        },
    });
    assert.equal(result.skipReason, 'blocked-canceled');
});

test('order created recognized from JWT eventType envelope only', () => {
    const result = normalizeOrderWebhookBody({
        eventType: 'wix.ecom.v1.order_created',
        createdEvent: {
            entity: {
                id: 'order-guid-2',
                paymentStatus: 'NOT_PAID',
                lineItems: [],
            },
        },
    });

    assert.equal(result.skipReason, undefined);
    const order = result.payload.order as Record<string, unknown>;
    assert.equal(order.id, 'order-guid-2');
});

test('order created skips fully refunded', () => {
    const result = normalizeOrderWebhookBody({
        eventType: 'wix.ecom.v1.order_created',
        createdEvent: {
            entity: {
                id: 'o3',
                paymentStatus: 'FULLY_REFUNDED',
                lineItems: [],
            },
        },
    });
    assert.equal(result.skipReason, 'blocked-fully_refunded');
});

test('extractShippingMethod reads SPI code and title from shippingInfo', () => {
    const method = extractShippingMethod({
        order: {
            shippingInfo: {
                carrierId: '253fa9c1-154a-4a3b-92e6-22de08ad44a2',
                title: 'Thai Nexus Express Prime DDP',
                code: 'prime_ddp',
            },
        },
    });

    assert.equal(method.code, 'prime_ddp');
    assert.equal(method.title, 'Thai Nexus Express Prime DDP');
    assert.equal(method.carrierId, '253fa9c1-154a-4a3b-92e6-22de08ad44a2');
});

test('extractShippingMethod reads selectedCarrierServiceOption', () => {
    const method = extractShippingMethod({
        order: {
            shippingInfo: {
                selectedCarrierServiceOption: { code: 'flex_dap', title: 'Flex DAP' },
            },
        },
    });

    assert.equal(method.code, 'flex_dap');
    assert.equal(method.title, 'Flex DAP');
});
