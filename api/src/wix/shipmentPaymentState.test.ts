import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedPaymentUrl, nextLocalPaymentStatus } from './shipmentPaymentState.js';

test('paid stays paid when the remote read is still unpaid', () => {
    assert.equal(nextLocalPaymentStatus('paid', 'unpaid'), 'paid');
});

test('confirming upgrades to paid after staff approval', () => {
    assert.equal(nextLocalPaymentStatus('confirming', 'paid'), 'paid');
});

test('unpaid becomes confirming while staff have not approved', () => {
    assert.equal(nextLocalPaymentStatus('unpaid', 'confirming'), 'confirming');
});

test('confirming is not cleared by an unpaid read', () => {
    assert.equal(nextLocalPaymentStatus('confirming', 'unpaid'), 'confirming');
});

test('payment links stay on the Thai Nexus pay page or a card checkout', () => {
    assert.equal(
        allowedPaymentUrl('https://app.thainexus.co.th/payment/abc'),
        'https://app.thainexus.co.th/payment/abc'
    );
    assert.equal(
        allowedPaymentUrl('https://checkout.stripe.com/c/pay/cs_test'),
        'https://checkout.stripe.com/c/pay/cs_test'
    );
    assert.equal(allowedPaymentUrl('https://evil.example/payment/abc'), null);
    assert.equal(allowedPaymentUrl('javascript:alert(1)'), null);
});
