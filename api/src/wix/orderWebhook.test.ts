import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderWebhookBody, extractShippingMethod, extractSelectedShipping, mapOrderLineItems, extractConsignee, needsOrderHydration, selectedShippingMissing, applySelectedShipping } from './orderWebhook.js';

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

test('mapOrderLineItems fills customs fields from Wix line items', () => {
    const items = mapOrderLineItems({
        order: {
            lineItems: [
                {
                    productName: { original: 'Cotton tee' },
                    quantity: 2,
                    price: { amount: '350', currency: 'THB' },
                    physicalProperties: { weight: 0.2, hs_code: '6109.10' },
                    countryOfOrigin: 'TH',
                },
            ],
        },
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Cotton tee');
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].discounted_price?.amount, '350');
    assert.equal(items[0].hs_code, '610910');
    assert.equal(items[0].country_of_origin, 'TH');
});

test('extractConsignee reads buyer and billing emails', () => {
    const fromBuyer = extractConsignee({
        order: {
            buyerInfo: { email: 'buyer@example.com' },
            shippingInfo: {
                logistics: {
                    shippingDestination: {
                        contactDetails: { firstName: 'Arnab', lastName: 'Mondal', phone: '+65' },
                        address: { addressLine: 'test', city: 'Singapore', country: 'SG' },
                    },
                },
            },
        },
    });
    assert.equal(fromBuyer.email, 'buyer@example.com');

    const fromBilling = extractConsignee({
        order: {
            billingInfo: { contactDetails: { email: 'bill@shop.com', firstName: 'A' } },
            shippingInfo: { logistics: { shippingDestination: { contactDetails: { phone: '1' } } } },
        },
    });
    assert.equal(fromBilling.email, 'bill@shop.com');
});

test('extractSelectedShipping reads cost.price and courier from shippingInfo', () => {
    const selected = extractSelectedShipping({
        order: {
            currency: 'THB',
            shippingInfo: {
                title: 'Flex DAP',
                code: 'flex_dap',
                cost: { price: { amount: '240.00', currency: 'THB' } },
            },
        },
    });

    assert.equal(selected.shipping_amount, 240);
    assert.equal(selected.shipping_currency, 'THB');
    assert.equal(selected.selected_courier, 'flex_dap');
    assert.equal(selected.selected_courier_title, 'Flex DAP');
});

test('extractSelectedShipping falls back to priceSummary.shipping', () => {
    const selected = extractSelectedShipping({
        order: {
            priceSummary: { shipping: { amount: '99.5' }, currency: 'THB' },
            shippingInfo: { title: 'Prime DDP', code: 'prime_ddp' },
        },
    });

    assert.equal(selected.shipping_amount, 99.5);
    assert.equal(selected.shipping_currency, 'THB');
    assert.equal(selected.selected_courier, 'prime_ddp');
});

test('needsOrderHydration when email exists but selected shipping does not', () => {
    const payload = {
        order: {
            buyerInfo: { email: 'buyer@example.com' },
            shippingInfo: {
                title: 'Flex DAP',
                code: 'flex_dap',
                logistics: {
                    shippingDestination: {
                        contactDetails: { firstName: 'A', lastName: 'B', phone: '1' },
                        address: { addressLine: 'x', city: 'Singapore', country: 'SG' },
                    },
                },
            },
        },
    };
    assert.equal(needsOrderHydration(payload), true);

    const withCost = {
        order: {
            ...(payload.order as Record<string, unknown>),
            currency: 'THB',
            shippingInfo: {
                ...(payload.order as { shippingInfo: Record<string, unknown> }).shippingInfo,
                cost: { price: { amount: '240', currency: 'THB' } },
            },
        },
    };
    assert.equal(needsOrderHydration(withCost), false);
    assert.equal(selectedShippingMissing(extractSelectedShipping(withCost)), false);
});

test('applySelectedShipping fills missing checkout rate onto an existing record', () => {
    const next = applySelectedShipping(
        {
            orderId: 'o1',
            instanceId: 'i1',
            requestNumbers: ['SR-1'],
            shipments: [],
            createdAt: '2026-09-01T00:00:00.000Z',
        },
        {
            shipping_amount: 240,
            shipping_currency: 'THB',
            selected_courier: 'flex_dap',
            selected_courier_title: 'Flex DAP',
        }
    );
    assert.equal(next.shipping_amount, 240);
    assert.equal(next.selected_courier, 'flex_dap');
});
