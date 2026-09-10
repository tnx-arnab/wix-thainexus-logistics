import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipmentsForOrder } from './shipments.js';
import { saveConfig } from './store.js';
import { bindWorkerDb, clearWorkerDb } from '../d1/client.js';
import { createMigratedMemoryD1 } from '../d1/memoryD1.js';

test('createShipmentsForOrder includes Wix origin metadata and platform tags in shipmentCrud payload', async () => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    process.env.WIX_APP_ID = 'test-wix-app-id-123';
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
CREATE TABLE IF NOT EXISTS thai_nexus_config (
    instance_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)
    );

    await saveConfig('test-inst-1', {
        apiToken: 'tn_token_xyz',
        shipper: {
            name: 'Sender',
            phone: '0812345678',
            street: '123 Sukhumvit',
            city: 'Bangkok',
            state: 'Bangkok',
            postalCode: '10110',
            country: 'TH',
        },
        boxes: [
            {
                id: 'box-1',
                name: 'Standard Box',
                innerLengthCm: 15,
                innerWidthCm: 15,
                innerDepthCm: 15,
                emptyWeightKg: 0.1,
                maxWeightKg: 5,
            },
        ],
    });

    const originalFetch = globalThis.fetch;
    let shipmentCrudPayload: any = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/shipmentCrud')) {
            const body = JSON.parse(String(init?.body || '{}'));
            shipmentCrudPayload = body;
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        request_number: 'REQ-12345',
                        status: 'pending',
                        id: 999,
                    },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return new Response('{}', { status: 400 });
    }) as typeof fetch;

    try {
        const result = await createShipmentsForOrder({
            instanceId: 'test-inst-1',
            orderId: '10045',
            shipper: {
                name: 'Sender',
                phone: '0812345678',
                street: '123 Sukhumvit',
                city: 'Bangkok',
                state: 'Bangkok',
                postalCode: '10110',
                country: 'TH',
            },
            consignee: {
                name: 'Receiver',
                phone: '0899999999',
                street: '456 Main St',
                city: 'Los Angeles',
                state: 'CA',
                postalCode: '90001',
                country: 'US',
            },
            items: [
                {
                    name: 'Test Item',
                    quantity: 1,
                    price: 50,
                    weight: 0.5,
                    length: 10,
                    width: 10,
                    height: 10,
                    hs_code: '123456',
                },
            ],
            boxes: [
                {
                    id: 'box-1',
                    name: 'Standard Box',
                    innerLengthCm: 15,
                    innerWidthCm: 15,
                    innerDepthCm: 15,
                    emptyWeightKg: 0.1,
                    maxWeightKg: 5,
                },
            ],
        });

        assert.equal(result.created.length, 1);
        assert.equal(result.created[0].request_number, 'REQ-12345');
        assert.ok(shipmentCrudPayload);
        assert.equal(shipmentCrudPayload.action, 'create');
        assert.equal(shipmentCrudPayload.data.platform, 'wix');
        assert.equal(shipmentCrudPayload.data.platform_order_id, '10045');
        assert.equal(shipmentCrudPayload.data.wix_instance_id, 'test-inst-1');
        assert.equal(shipmentCrudPayload.data.wix_app_id, 'test-wix-app-id-123');
        assert.deepEqual(shipmentCrudPayload.data.metadata, {
            source: 'wix_app',
            instance_id: 'test-inst-1',
            order_id: '10045',
        });
    } finally {
        globalThis.fetch = originalFetch;
        clearWorkerDb();
    }
});
