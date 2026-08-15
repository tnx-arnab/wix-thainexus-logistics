import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import { dashboardIdentityFromQuery, instanceIdFromDashboardQuery } from './instanceParam.js';
import { webhookVerifySkipped } from './verify.js';

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
    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';
    assert.equal(instanceIdFromDashboardQuery(INSTANCE_ID), null);

    process.env.ALLOW_PLAIN_INSTANCE_ID = 'true';
    assert.equal(instanceIdFromDashboardQuery(INSTANCE_ID), INSTANCE_ID);

    process.env.NODE_ENV = 'production';
    assert.equal(instanceIdFromDashboardQuery(INSTANCE_ID), null);
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
});

function signedAppInstanceParam(secret: string, data: Record<string, unknown>): string {
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(encoded)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${signature}.${encoded}`;
}

test('dashboardIdentityFromQuery verifies the 2-part app instance parameter', () => {
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';
    process.env.WIX_APP_SECRET = 'super-secret';

    const param = signedAppInstanceParam('super-secret', {
        instanceId: INSTANCE_ID,
        uid: 'wix-user-42',
    });
    assert.deepEqual(dashboardIdentityFromQuery(param), {
        instanceId: INSTANCE_ID,
        userId: 'wix-user-42',
    });
});

test('dashboardIdentityFromQuery rejects app instance param with wrong secret', () => {
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';
    process.env.WIX_APP_SECRET = 'correct-secret';

    const param = signedAppInstanceParam('attacker-secret', { instanceId: INSTANCE_ID });
    assert.equal(dashboardIdentityFromQuery(param), null);
});

test('dashboardIdentityFromQuery uses Wix uid from verified JWT', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.WIX_PUBLIC_KEY = publicKey;
    process.env.WIX_APP_ID = 'app-id-test';
    process.env.WEBHOOK_SKIP_VERIFY = '';
    process.env.ALLOW_PLAIN_INSTANCE_ID = '';

    const token = signedInstanceJwt(privateKey, { instanceId: INSTANCE_ID, uid: 'wix-user-9' });
    assert.deepEqual(dashboardIdentityFromQuery(token), {
        instanceId: INSTANCE_ID,
        userId: 'wix-user-9',
    });
});

test('webhookVerifySkipped is ignored in production', () => {
    const prevNode = process.env.NODE_ENV;
    const prevSkip = process.env.WEBHOOK_SKIP_VERIFY;
    process.env.WEBHOOK_SKIP_VERIFY = 'true';
    process.env.NODE_ENV = 'development';
    assert.equal(webhookVerifySkipped(), true);
    process.env.NODE_ENV = 'production';
    assert.equal(webhookVerifySkipped(), false);
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevSkip === undefined) delete process.env.WEBHOOK_SKIP_VERIFY;
    else process.env.WEBHOOK_SKIP_VERIFY = prevSkip;
});
