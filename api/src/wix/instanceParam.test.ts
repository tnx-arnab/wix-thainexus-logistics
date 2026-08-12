import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import { instanceIdFromDashboardQuery } from './instanceParam.js';

const INSTANCE_ID = '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4';

function signedInstanceJwt(privateKey: string, claims: Record<string, unknown>): string {
    return jwt.sign(claims, privateKey, {
        algorithm: 'RS256',
        issuer: 'wix.com',
        audience: 'app-id-test',
    });
}

test('instanceIdFromDashboardQuery accepts a verified Wix JWT', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.WIX_PUBLIC_KEY = publicKey;
    process.env.WIX_APP_ID = 'app-id-test';
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';

    const token = signedInstanceJwt(privateKey, { instanceId: INSTANCE_ID });
    assert.equal(instanceIdFromDashboardQuery(token), INSTANCE_ID);
});

test('instanceIdFromDashboardQuery rejects unsigned JWT payloads', () => {
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';
    process.env.WIX_PUBLIC_KEY = 'not-a-real-key';
    process.env.WIX_APP_ID = 'app-id-test';

    const payload = Buffer.from(JSON.stringify({ instanceId: INSTANCE_ID })).toString(
        'base64url'
    );
    const fakeJwt = `eyJhbGciOiJub25lIn0.${payload}.x`;
    assert.equal(instanceIdFromDashboardQuery(fakeJwt), null);
    assert.equal(instanceIdFromDashboardQuery(payload), null);
});

test('instanceIdFromDashboardQuery allows plain UUID only when enabled', () => {
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';
    assert.equal(instanceIdFromDashboardQuery(INSTANCE_ID), null);

    process.env.ALLOW_PLAIN_INSTANCE_ID = 'true';
    assert.equal(instanceIdFromDashboardQuery(INSTANCE_ID), INSTANCE_ID);
});
