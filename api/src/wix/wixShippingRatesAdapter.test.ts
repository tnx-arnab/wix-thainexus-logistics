import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateResponseToWix } from './wixShippingRatesAdapter.js';
import type { BcRateResponse } from '@thai-nexus/shared';

test('rateResponseToWix assigns unique codes per courier and human deliveryTime', () => {
    const response: BcRateResponse = {
        quote_id: 'q1',
        messages: [],
        carrier_quotes: [
            {
                carrier_info: { code: 'thainexus', display_name: 'Thai Nexus' },
                quotes: [
                    {
                        code: 'prime_ddp',
                        rate_id: 'tn_7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4_prime_ddp',
                        display_name: 'Prime DDP',
                        cost: { currency: 'THB', amount: 100 },
                        transit_time: { units: 'BUSINESS_DAYS', duration: 5 },
                    },
                    {
                        code: 'flex_dap',
                        rate_id: 'tn_7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4_flex_dap',
                        display_name: 'Flex DAP',
                        cost: { currency: 'THB', amount: 80 },
                        transit_time: { units: 'BUSINESS_DAYS', duration: 4 },
                    },
                ],
            },
        ],
    };

    const { shippingRates } = rateResponseToWix(response, 'THB');
    assert.equal(shippingRates.length, 2);
    const codes = shippingRates.map((r) => r.code).sort();
    assert.deepEqual(codes, ['flex_dap', 'prime_ddp']);
    const prime = shippingRates.find((r) => r.code === 'prime_ddp');
    assert.equal(prime?.logistics?.deliveryTime, '5 business days');
});
