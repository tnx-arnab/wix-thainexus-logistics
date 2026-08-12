import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import { normalizeWixPublicKeyPem } from './verify.js';
import { parseWixWebhookRequest } from './parseWebhook.js';

test('parseWixWebhookRequest unwraps REST JWT envelope', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.WIX_PUBLIC_KEY = publicKey;
    process.env.WIX_APP_ID = 'app-id-test';
    process.env.WEBHOOK_SKIP_VERIFY = '';

    const eventBody = {
        id: 'evt-1',
        slug: 'payment_status_updated',
        actionEvent: {
            body: {
                order: {
                    id: 'order-guid',
                    paymentStatus: 'PAID',
                    shippingInfo: { carrierId: 'app-123', title: 'Flex' },
                },
            },
        },
    };

    const envelope = {
        eventType: 'wix.ecom.v1.payment_status_updated',
        instanceId: '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4',
        data: JSON.stringify(eventBody),
    };

    const token = jwt.sign({ data: JSON.stringify(envelope) }, privateKey, {
        algorithm: 'RS256',
        issuer: 'wix.com',
        audience: 'app-id-test',
    });

    const pem = normalizeWixPublicKeyPem(publicKey);
    assert.ok(pem.includes('BEGIN PUBLIC KEY'));

    const result = parseWixWebhookRequest(token);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.parsed.instanceId, '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4');
    assert.equal(result.parsed.eventBody.slug, 'payment_status_updated');
    assert.equal(
        (
            (result.parsed.eventBody.actionEvent as Record<string, unknown>).body as Record<
                string,
                unknown
            >
        ).order &&
            (
                (
                    (result.parsed.eventBody.actionEvent as Record<string, unknown>)
                        .body as Record<string, unknown>
                ).order as Record<string, unknown>
            ).id,
        'order-guid'
    );
});

test('parseWixWebhookRequest accepts plain JSON in dev', () => {
    process.env.WEBHOOK_SKIP_VERIFY = 'true';
    const body = {
        instanceId: 'inst-1',
        slug: 'payment_status_updated',
        actionEvent: { body: { order: { id: 'o1', paymentStatus: 'PAID' } } },
    };
    const result = parseWixWebhookRequest(body);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.parsed.instanceId, 'inst-1');
});

test('parseWixWebhookRequest rejects JWT without iss', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.WIX_PUBLIC_KEY = publicKey;
    process.env.WIX_APP_ID = 'app-id-test';
    process.env.WEBHOOK_SKIP_VERIFY = '';

    const token = jwt.sign({ data: JSON.stringify({ instanceId: 'x', eventType: 't' }) }, privateKey, {
        algorithm: 'RS256',
        audience: 'app-id-test',
    });

    const result = parseWixWebhookRequest(token);
    assert.equal(result.ok, false);
});

test('parseWixWebhookRequest rejects plain JSON when verify is enabled', () => {
    process.env.WEBHOOK_SKIP_VERIFY = '';
    const body = {
        instanceId: 'inst-1',
        slug: 'payment_status_updated',
        actionEvent: { body: { order: { id: 'o1', paymentStatus: 'PAID' } } },
    };
    const result = parseWixWebhookRequest(body);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'missing-jwt-body');
});
