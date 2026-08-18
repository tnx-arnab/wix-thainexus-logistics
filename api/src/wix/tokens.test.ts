import assert from 'node:assert/strict';
import test from 'node:test';
import { accessTokenNeedsRefresh } from './tokens.js';

test('opaque Wix access tokens need a new Easy OAuth mint', () => {
    assert.equal(accessTokenNeedsRefresh('OAUopaque-token-value'), true);
});

test('JWT without exp needs a new Easy OAuth mint', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
    assert.equal(accessTokenNeedsRefresh(`eyJhbGciOiJub25lIn0.${payload}.x`), true);
});

test('JWT with past exp needs refresh', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_700_000_000 })).toString('base64url');
    assert.equal(accessTokenNeedsRefresh(`eyJhbGciOiJub25lIn0.${payload}.x`, 1_800_000_000), true);
});

test('JWT with future exp does not need refresh', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString('base64url');
    assert.equal(accessTokenNeedsRefresh(`eyJhbGciOiJub25lIn0.${payload}.x`, 1_800_000_000), false);
});

test('instanceIdFromAccessToken reads OAUTH2-prefixed JWT with string data', async () => {
    const { instanceIdFromAccessToken } = await import('./tokens.js');
    const header = Buffer.from(JSON.stringify({ kid: 'VQ401TeZ', alg: 'HS256' })).toString(
        'base64url'
    );
    const payload = Buffer.from(
        JSON.stringify({
            data: JSON.stringify({
                appId: '253fa9c1-154a-4a3b-92e6-22de08ad44a2',
                instanceId: '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4',
                scope: [],
                version: '1.0.0',
            }),
            iat: 1_786_819_619,
            exp: 1_786_820_219,
        })
    ).toString('base64url');
    const token = `OAUTH2.${header}.${payload}.sig`;
    assert.equal(instanceIdFromAccessToken(token), '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4');
});

test('instanceIdFromAccessToken reads standard JWT instanceId claim', async () => {
    const { instanceIdFromAccessToken } = await import('./tokens.js');
    const payload = Buffer.from(
        JSON.stringify({ instanceId: '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4' })
    ).toString('base64url');
    assert.equal(
        instanceIdFromAccessToken(`eyJhbGciOiJub25lIn0.${payload}.x`),
        '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4'
    );
});

test('getValidAccessToken mints Easy OAuth and caches the token', async () => {
    const { bindWorkerDb, clearWorkerDb, getStore } = await import('@thai-nexus/shared');
    const { createMigratedMemoryD1 } = await import('../../../shared/src/d1/memoryD1.js');
    const { getValidAccessToken } = await import('./tokens.js');

    process.env.ENCRYPTION_KEY = 'test-encryption-key-16';
    process.env.WIX_APP_ID = 'app-id';
    process.env.WIX_APP_SECRET = 'app-secret';
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
`)
    );

    const original = globalThis.fetch;
    let mintCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/oauth2/token')) {
            mintCalls += 1;
            const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
            assert.equal(body.grant_type, 'client_credentials');
            assert.equal(body.instance_id, '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4');
            const exp = Math.floor(Date.now() / 1000) + 14_400;
            const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
            return new Response(
                JSON.stringify({ access_token: `eyJhbGciOiJub25lIn0.${payload}.minted` }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return new Response('{}', { status: 400 });
    }) as typeof fetch;

    try {
        const first = await getValidAccessToken('7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4');
        const second = await getValidAccessToken('7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4');
        assert.equal(mintCalls, 1);
        assert.equal(first, second);
        assert.equal((await getStore('7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4'))?.access_token, first);
    } finally {
        globalThis.fetch = original;
        clearWorkerDb();
    }
});
