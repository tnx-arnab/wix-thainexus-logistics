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
