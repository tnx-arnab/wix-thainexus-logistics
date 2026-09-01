import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCheckoutRateMultiplier, CHECKOUT_RATE_MULTIPLIER } from './checkoutRate.js';

test('CHECKOUT_RATE_MULTIPLIER is 1.25', () => {
    assert.equal(CHECKOUT_RATE_MULTIPLIER, 1.25);
});

test('applyCheckoutRateMultiplier multiplies original THB by 1.25', () => {
    assert.equal(applyCheckoutRateMultiplier(100), 125);
    assert.equal(applyCheckoutRateMultiplier(0), 0);
});

test('applyCheckoutRateMultiplier rounds to 2 decimal places', () => {
    assert.equal(applyCheckoutRateMultiplier(10.01), 12.51);
    assert.equal(applyCheckoutRateMultiplier(10.005), 12.51);
    assert.equal(applyCheckoutRateMultiplier(80), 100);
    assert.equal(applyCheckoutRateMultiplier(0.01), 0.01);
    assert.equal(applyCheckoutRateMultiplier(0.02), 0.03);
});
