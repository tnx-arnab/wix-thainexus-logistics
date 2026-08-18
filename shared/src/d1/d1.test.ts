import assert from 'node:assert/strict';
import test from 'node:test';
import { all, bindWorkerDb, clearWorkerDb, first, getDb, parseJson, probeDb, run } from './client.js';
import { createMigratedMemoryD1 } from './memoryD1.js';
import {
    deleteStore,
    getStore,
    hasStoreUser,
    redactInstanceData,
    setStore,
    setStoreUser,
    updateStoreTokens,
} from './wixStore.js';
import { deleteConfig, getConfig, getApiToken, saveConfig, toPublic, copyConfigIfMissing } from '../thaiNexus/store.js';
import { getProductFlags, resolveProductFlagMap, setProductFlags } from './productFlags.js';
import {
    getProductPhysicalOverride,
    getProductPhysicalOverridesMap,
    setProductPhysicalOverride,
} from './productPhysicalOverride.js';
import {
    getOrderShipments,
    isOrderShipmentRecordComplete,
    listStoredOrderShipments,
    saveOrderShipments,
} from './orderShipments.js';
import { appendDebugLog, clearDebugLogs, isDebugEnabled, listDebugLogs, trimDebugLogsByKind } from './debugLog.js';
import {
    listInstallLogs,
    listMerchantSpiEvents,
    listRateTraces,
    logInstallEvent,
    logMerchantSpiEvent,
    logRateTrace,
} from './installLog.js';
import type { SessionProps } from '../types/index.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stores (
    instance_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL DEFAULT '',
    site_id TEXT,
    meta_site_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS store_users (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS thai_nexus_config (
    instance_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_shipments (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS debug_logs (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    logged_at TEXT NOT NULL,
    data TEXT NOT NULL,
    kind TEXT GENERATED ALWAYS AS (json_extract(data, '$.kind')) STORED
);
CREATE TABLE IF NOT EXISTS install_logs (
    id TEXT PRIMARY KEY,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    instance_id TEXT NOT NULL DEFAULT '__install__',
    route TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS product_flags (
    instance_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    is_document INTEGER NOT NULL DEFAULT 0,
    is_boxed INTEGER NOT NULL DEFAULT 0,
    shipping_eligible INTEGER NOT NULL DEFAULT 1,
    physical_override TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (instance_id, product_id)
);
`;

function session(instanceId: string, access = 'tok-a'): SessionProps {
    return {
        instance_id: instanceId,
        access_token: access,
        refresh_token: 'ref-a',
        scope: 'offline',
        site_id: 'site-1',
        user: { id: 'user-1', email: 'a@example.com' },
        owner: { id: 'user-1', email: 'a@example.com' },
    };
}

function setupDb() {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    process.env.DEBUG_MODE = 'true';
    process.env.NODE_ENV = 'test';
    bindWorkerDb(createMigratedMemoryD1(SCHEMA));
}

test('stores: upsert encrypts and getStore decrypts', async () => {
    setupDb();
    await setStore(session('inst-a'));
    const row = await getStore('inst-a');
    assert.equal(row?.access_token, 'tok-a');
    assert.equal(row?.refresh_token, 'ref-a');
    assert.equal(await getStore('missing'), null);
});

test('stores: update tokens, users, delete', async () => {
    setupDb();
    await setStore(session('inst-a'));
    await setStoreUser(session('inst-a'));
    assert.equal(await hasStoreUser('inst-a', 'user-1'), true);
    await setStoreUser(session('inst-a'));
    await updateStoreTokens('inst-a', { access_token: 'tok-b', refresh_token: 'ref-b' });
    assert.equal((await getStore('inst-a'))?.access_token, 'tok-b');
    await deleteStore('inst-a');
    assert.equal(await getStore('inst-a'), null);
    assert.equal(await hasStoreUser('inst-a', 'user-1'), false);
});

test('stores: requireToken throws without access token', async () => {
    setupDb();
    await assert.rejects(setStore(session('inst-a', ''), { requireToken: true }), /access token/);
});

test('config: save JSON and keep token when omitted', async () => {
    setupDb();
    const shipper = {
        name: 'A',
        phone: '1',
        street: 's',
        city: 'Bangkok',
        state: 'BKK',
        postalCode: '10110',
        country: 'TH',
    };
    await saveConfig('inst-a', { apiToken: 'secret-token', shipper });
    assert.equal(await getApiToken('inst-a'), 'secret-token');
    assert.equal(toPublic(await getConfig('inst-a')).hasApiToken, true);
    assert.equal(JSON.stringify(toPublic(await getConfig('inst-a'))).includes('secret-token'), false);
    await saveConfig('inst-a', { shipper: { ...shipper, name: 'B' } });
    assert.equal(await getApiToken('inst-a'), 'secret-token');
    assert.equal((await getConfig('inst-a'))?.shipper.name, 'B');
});

test('config: copyConfigIfMissing copies once and skips existing dest', async () => {
    setupDb();
    const shipper = {
        name: 'Origin',
        phone: '1',
        street: 's',
        city: 'Bangkok',
        state: 'BKK',
        postalCode: '10110',
        country: 'TH',
    };
    await saveConfig('inst-origin', { apiToken: 'secret-token', shipper });
    assert.equal(await copyConfigIfMissing('inst-origin', 'inst-clone'), true);
    assert.equal(await getApiToken('inst-clone'), 'secret-token');
    assert.equal((await getConfig('inst-clone'))?.shipper.name, 'Origin');
    await saveConfig('inst-clone', { shipper: { ...shipper, name: 'Clone' } });
    assert.equal(await copyConfigIfMissing('inst-origin', 'inst-clone'), false);
    assert.equal((await getConfig('inst-clone'))?.shipper.name, 'Clone');
    assert.equal(await copyConfigIfMissing('inst-origin', 'inst-origin'), false);
});

test('product flags: defaults, round-trip, keep physical_override', async () => {
    setupDb();
    assert.deepEqual(await getProductFlags('inst-a', 'p1'), {
        isDocument: false,
        isBoxedProduct: false,
        shippingEligible: true,
    });
    await setProductFlags('inst-a', 'p1', {
        isDocument: true,
        isBoxedProduct: true,
        shippingEligible: false,
    });
    await setProductPhysicalOverride('inst-a', 'p1', {
        weightKg: 1,
        lengthCm: 2,
        widthCm: 3,
        heightCm: 4,
    });
    await setProductFlags('inst-a', 'p1', {
        isDocument: false,
        isBoxedProduct: true,
        shippingEligible: true,
    });
    assert.deepEqual(await getProductPhysicalOverride('inst-a', 'p1'), {
        weightKg: 1,
        lengthCm: 2,
        widthCm: 3,
        heightCm: 4,
    });
    assert.deepEqual(await resolveProductFlagMap('inst-a', [], 'is_document'), {});
    assert.deepEqual(await resolveProductFlagMap('inst-a', ['p1'], 'is_boxed'), { p1: true });
});

test('order shipments: round-trip and list', async () => {
    setupDb();
    await saveOrderShipments({
        instanceId: 'inst-a',
        orderId: 'ord-1',
        createdAt: '2026-01-02T00:00:00.000Z',
        requestNumbers: ['RN1'],
        shipments: [{ request_number: 'RN1', status: 'ok' }],
    });
    const record = await getOrderShipments('inst-a', 'ord-1');
    assert.deepEqual(record?.requestNumbers, ['RN1']);
    assert.equal(isOrderShipmentRecordComplete(record!), true);
    const list = await listStoredOrderShipments('inst-a');
    assert.equal(list[0]?.request_number, 'RN1');
});

test('logs: kind filters and debug off', async () => {
    setupDb();
    await logInstallEvent({ route: '/api/auth', ok: true, instance_id: 'inst-a' });
    await logMerchantSpiEvent('inst-a', { phase: 'received', items: 1 });
    await logRateTrace({ phase: 'received', store_id: 'inst-a', items: 2 });
    await appendDebugLog('inst-a', {
        timestamp: new Date().toISOString(),
        products: [{ id: 'p', title: 't', qty: 1, dimensions: '1', weight: '1' }],
        box_count: 1,
        boxes: [],
        destination: {},
        api_calls: [],
        final_quotes: [],
        currency: 'THB',
    });

    const installs = await listInstallLogs(10);
    assert.equal(installs.some((l) => l.instance_id === 'inst-a'), true);
    assert.equal((await listMerchantSpiEvents('inst-b', 10)).length, 0);
    assert.equal((await listMerchantSpiEvents('inst-a', 10)).length, 1);
    assert.equal((await listRateTraces(10)).length, 1);
    assert.equal((await listDebugLogs('inst-a')).length, 1);
    assert.equal(await clearDebugLogs('inst-a'), 1);
    assert.equal((await listInstallLogs(10)).length, 1);

    process.env.DEBUG_MODE = 'false';
    process.env.NODE_ENV = 'production';
    assert.equal(isDebugEnabled(), false);
    await appendDebugLog('inst-a', {
        timestamp: new Date().toISOString(),
        products: [],
        box_count: 0,
        boxes: [],
        destination: {},
        api_calls: [],
        final_quotes: [],
        currency: 'THB',
    });
    assert.equal((await listDebugLogs('inst-a')).length, 0);
});

test('redact instance A leaves B', async () => {
    setupDb();
    await setStore(session('inst-a'));
    await setStore(session('inst-b', 'tok-b'));
    const shipper = {
        name: 'A',
        phone: '1',
        street: 's',
        city: 'c',
        state: 's',
        postalCode: '1',
        country: 'TH',
    };
    await saveConfig('inst-a', { apiToken: 'a', shipper });
    await saveConfig('inst-b', { apiToken: 'b', shipper: { ...shipper, name: 'B' } });
    await redactInstanceData('inst-a');
    assert.equal(await getStore('inst-a'), null);
    assert.ok(await getStore('inst-b'));
    assert.ok(await getConfig('inst-b'));
    assert.equal(await getConfig('inst-a'), null);
});

test('schema: physical_override and generated kind', async () => {
    setupDb();
    const cols = await all<{ name: string }>('PRAGMA table_info(product_flags)');
    assert.equal(cols.some((c) => c.name === 'physical_override'), true);
    await run(
        `INSERT INTO debug_logs (id, instance_id, logged_at, data)
         VALUES ('k1', 'inst-a', '2026-01-01T00:00:00.000Z', '{"kind":"install"}')`
    );
    const row = await first<{ kind: string }>('SELECT kind FROM debug_logs WHERE id = ?', 'k1');
    assert.equal(row?.kind, 'install');
});

test('config: deleteConfig removes row', async () => {
    setupDb();
    const shipper = {
        name: 'A',
        phone: '1',
        street: 's',
        city: 'c',
        state: 's',
        postalCode: '1',
        country: 'TH',
    };
    await saveConfig('inst-a', { apiToken: 'tok', shipper });
    await deleteConfig('inst-a');
    assert.equal(await getConfig('inst-a'), null);
});

test('product flags: json_each map and boolean round-trip', async () => {
    setupDb();
    await setProductPhysicalOverride('inst-a', 'p1', { weightKg: 1, lengthCm: 2, widthCm: 3, heightCm: 4 });
    await setProductPhysicalOverride('inst-a', 'p2', { weightKg: 5, lengthCm: 6, widthCm: 7, heightCm: 8 });
    const two = await getProductPhysicalOverridesMap('inst-a', ['p1', 'missing']);
    assert.ok(two.p1);
    assert.equal(two.missing, undefined);
    const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
    await setProductFlags('inst-a', 'p20', {
        isDocument: true,
        isBoxedProduct: false,
        shippingEligible: false,
    });
    const map = await resolveProductFlagMap('inst-a', ids, 'is_document');
    assert.equal(map.p20, true);
    const flags = await getProductFlags('inst-a', 'p20');
    assert.equal(flags.isDocument, true);
    assert.equal(flags.shippingEligible, false);
    assert.deepEqual(await getProductPhysicalOverridesMap('inst-a', []), {});
});

test('order shipments: newest first and duplicate request numbers dropped', async () => {
    setupDb();
    await saveOrderShipments({
        instanceId: 'inst-a',
        orderId: 'ord-old',
        createdAt: '2026-01-01T00:00:00.000Z',
        requestNumbers: ['RN1'],
        shipments: [{ request_number: 'RN1', status: 'ok' }],
    });
    await saveOrderShipments({
        instanceId: 'inst-a',
        orderId: 'ord-new',
        createdAt: '2026-01-03T00:00:00.000Z',
        requestNumbers: ['RN1', 'RN2'],
        shipments: [
            { request_number: 'RN1', status: 'dup' },
            { request_number: 'RN2', status: 'ok' },
        ],
    });
    const list = await listStoredOrderShipments('inst-a');
    assert.equal(list[0]?.request_number, 'RN1');
    assert.equal(list.filter((s) => s.request_number === 'RN1').length, 1);
    assert.equal(list.some((s) => s.request_number === 'RN2'), true);
});

test('logs: trim rate logs to 50', async () => {
    setupDb();
    for (let i = 0; i < 51; i += 1) {
        await appendDebugLog('inst-a', {
            timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
            products: [{ id: 'p', title: 't', qty: 1, dimensions: '1', weight: '1' }],
            box_count: 1,
            boxes: [],
            destination: {},
            api_calls: [],
            final_quotes: [],
            currency: 'THB',
        });
    }
    const count = await first<{ n: number }>(
        `SELECT COUNT(*) AS n FROM debug_logs WHERE instance_id = ? AND (kind IS NULL OR kind = '')`,
        'inst-a'
    );
    assert.equal(count?.n, 50);
});

test('json parse and getDb binding', async () => {
    setupDb();
    assert.throws(() => parseJson('{'), /Invalid JSON in database/);
    assert.equal(parseJson('{', null), null);
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
    await probeDb();
    assert.ok(getDb());
    clearWorkerDb();
    assert.throws(() => getDb(), /D1 binding DB is missing/);
});

test('logs: listDebugLogs ignores newer install rows', async () => {
    setupDb();
    for (let i = 0; i < 50; i += 1) {
        await run(
            `INSERT INTO debug_logs (id, instance_id, logged_at, data)
             VALUES (?, 'inst-a', ?, ?)`,
            `ins${i}`,
            `2026-02-01T00:00:${String(i).padStart(2, '0')}.000Z`,
            JSON.stringify({ kind: 'install', route: '/x' })
        );
    }
    await appendDebugLog('inst-a', {
        timestamp: '2026-01-01T00:00:00.000Z',
        products: [{ id: 'p', title: 't', qty: 1, dimensions: '1', weight: '1' }],
        box_count: 1,
        boxes: [],
        destination: {},
        api_calls: [],
        final_quotes: [],
        currency: 'THB',
    });
    const logs = await listDebugLogs('inst-a');
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.products[0]?.id, 'p');
});

test('logs: trimDebugLogsByKind deletes beyond max', async () => {
    setupDb();
    for (let i = 0; i < 15; i += 1) {
        await logMerchantSpiEvent('inst-a', { phase: 'received', items: i });
    }
    await trimDebugLogsByKind('spi_event', 5, 'inst-a');
    assert.equal((await listMerchantSpiEvents('inst-a', 50)).length, 5);
});

test('order shipments: skips corrupt JSON rows', async () => {
    setupDb();
    await saveOrderShipments({
        instanceId: 'inst-a',
        orderId: 'ord-1',
        createdAt: '2026-01-02T00:00:00.000Z',
        requestNumbers: ['RN1'],
        shipments: [{ request_number: 'RN1', status: 'ok' }],
    });
    await run(
        `INSERT INTO order_shipments (id, instance_id, order_id, data, created_at)
         VALUES ('inst-a_bad', 'inst-a', 'bad', 'not-json', '2026-01-03T00:00:00.000Z')`
    );
    const list = await listStoredOrderShipments('inst-a');
    assert.equal(list[0]?.request_number, 'RN1');
});
