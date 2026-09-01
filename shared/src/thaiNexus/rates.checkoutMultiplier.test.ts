import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { bindWorkerDb, clearWorkerDb } from '../d1/client.js';
import { createMigratedMemoryD1 } from '../d1/memoryD1.js';
import { saveConfig } from './store.js';
import { calculateRates } from './rates.js';
import type { BcRateRequest, CommissionRule, ShipperProfile, ShippingBox } from '../types/thaiNexus.js';

const INSTANCE_ID = '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS thai_nexus_config (
    instance_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const shipper: ShipperProfile = {
    name: 'Thai Nexus Store',
    phone: '+66000000000',
    street: '123 Road',
    city: 'Bangkok',
    state: 'BKK',
    postalCode: '10110',
    country: 'TH',
};

const box: ShippingBox = {
    id: 'box_1',
    name: 'Medium',
    innerLengthCm: 40,
    innerWidthCm: 30,
    innerDepthCm: 20,
    maxWeightKg: 10,
    emptyWeightKg: 0.2,
};

function rateRequest(): BcRateRequest {
    return {
        base_options: {
            store_id: INSTANCE_ID,
            currency_code: 'THB',
            destination: {
                zip: '10110',
                city: 'Bangkok',
                state_iso2: 'BKK',
                country_iso2: 'US',
            },
            items: [
                {
                    product_id: '101',
                    name: 'Phone case',
                    quantity: 1,
                    length: { units: 'cm', value: 18 },
                    width: { units: 'cm', value: 10 },
                    height: { units: 'cm', value: 3 },
                    weight: { units: 'kg', value: 0.15 },
                    discounted_price: { currency: 'THB', amount: '500' },
                },
            ],
        },
    };
}

async function withMockedApiQuote(
    quotes: Array<{ courier_name: string; display_name: string; estimated_days: number; final_price_thb: number }>,
    fn: () => Promise<void>
): Promise<void> {
    const original = globalThis.fetch;
    let quoteCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes('apiQuote')) {
            throw new Error(`Unexpected fetch in rate test: ${url}`);
        }
        quoteCalls += 1;
        return new Response(JSON.stringify({ quotes }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
    try {
        await fn();
        assert.ok(quoteCalls > 0, 'expected Thai Nexus apiQuote to be called');
    } finally {
        globalThis.fetch = original;
    }
}

function quoteAmount(response: Awaited<ReturnType<typeof calculateRates>>, courier = 'prime_ddp'): number {
    const quotes = response.carrier_quotes?.[0]?.quotes || [];
    const match = quotes.find((q) => q.code === courier) || quotes[0];
    return match?.cost?.amount ?? NaN;
}

describe('calculateRates checkout uses Thai Nexus API price', () => {
    const prevEnc = process.env.ENCRYPTION_KEY;
    const prevDebug = process.env.DEBUG_MODE;
    const prevNode = process.env.NODE_ENV;

    beforeEach(async () => {
        process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
        process.env.DEBUG_MODE = 'false';
        process.env.NODE_ENV = 'production';
        bindWorkerDb(createMigratedMemoryD1(SCHEMA));
        await saveConfig(INSTANCE_ID, {
            apiToken: 'tn-test-token',
            shipper,
            boxes: [box],
            commissionRules: [],
        });
    });

    afterEach(() => {
        clearWorkerDb();
        if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = prevEnc;
        if (prevDebug === undefined) delete process.env.DEBUG_MODE;
        else process.env.DEBUG_MODE = prevDebug;
        if (prevNode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNode;
    });

    it('shows the original Thai Nexus quote at checkout with no 1.25 markup', async () => {
        await withMockedApiQuote(
            [
                {
                    courier_name: 'Prime DDP',
                    display_name: 'Prime DDP',
                    estimated_days: 5,
                    final_price_thb: 100,
                },
            ],
            async () => {
                const result = await calculateRates(rateRequest());
                assert.equal(quoteAmount(result, 'prime_ddp'), 100);
                assert.equal(result.carrier_quotes?.[0]?.quotes?.[0]?.cost.currency, 'THB');
            }
        );
    });

    it('passes through each courier quote independently', async () => {
        await withMockedApiQuote(
            [
                {
                    courier_name: 'Prime DDP',
                    display_name: 'Prime DDP',
                    estimated_days: 5,
                    final_price_thb: 100,
                },
                {
                    courier_name: 'Flex DAP',
                    display_name: 'Flex DAP',
                    estimated_days: 4,
                    final_price_thb: 80,
                },
            ],
            async () => {
                const result = await calculateRates(rateRequest());
                assert.equal(quoteAmount(result, 'prime_ddp'), 100);
                assert.equal(quoteAmount(result, 'flex_dap'), 80);
            }
        );
    });

    it('adds configured commission on top of the original API price', async () => {
        await saveConfig(INSTANCE_ID, {
            apiToken: 'tn-test-token',
            shipper,
            boxes: [box],
            commissionRules: [
                {
                    id: 'fee_1',
                    conditionType: 'subtotal_range',
                    minRange: 0,
                    maxRange: 0,
                    feeType: 'fixed',
                    feeValue: 10,
                    feeLabel: 'Commission Fee',
                } satisfies CommissionRule,
            ],
        });

        await withMockedApiQuote(
            [
                {
                    courier_name: 'Prime DDP',
                    display_name: 'Prime DDP',
                    estimated_days: 5,
                    final_price_thb: 100,
                },
            ],
            async () => {
                const result = await calculateRates(rateRequest());
                // 100 + 10 = 110; not 100 * 1.25 + 10 = 135
                assert.equal(quoteAmount(result, 'prime_ddp'), 110);
            }
        );
    });

    it('rounds the original quote to 2 decimal places', async () => {
        await withMockedApiQuote(
            [
                {
                    courier_name: 'Prime DDP',
                    display_name: 'Prime DDP',
                    estimated_days: 5,
                    final_price_thb: 10.015,
                },
            ],
            async () => {
                const result = await calculateRates(rateRequest());
                assert.equal(quoteAmount(result, 'prime_ddp'), 10.02);
            }
        );
    });
});
