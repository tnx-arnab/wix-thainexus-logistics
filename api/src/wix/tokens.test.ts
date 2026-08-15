import assert from 'node:assert/strict';
import test from 'node:test';
import { accessTokenNeedsRefresh } from './tokens.js';

test('opaque Wix access tokens do not look expired', () => {
    assert.equal(accessTokenNeedsRefresh('OAUopaque-token-value'), false);
});

test('JWT without exp does not look expired', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
    assert.equal(accessTokenNeedsRefresh(`eyJhbGciOiJub25lIn0.${payload}.x`), false);
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
