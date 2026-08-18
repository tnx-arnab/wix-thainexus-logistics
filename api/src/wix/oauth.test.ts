import assert from 'node:assert/strict';
import test from 'node:test';
import { createWixAccessToken, resolveWixInstallIdentity } from './oauth.js';

const INSTANCE_ID = '7f09dd49-70c6-4c96-8c6e-cfab07d6c6d4';

function oauth2Code(instanceId: string): string {
    const header = Buffer.from(JSON.stringify({ kid: 'VQ401TeZ', alg: 'HS256' })).toString(
        'base64url'
    );
    const payload = Buffer.from(
        JSON.stringify({
            data: JSON.stringify({
                appId: '253fa9c1-154a-4a3b-92e6-22de08ad44a2',
                instanceId,
                scope: [],
                version: '1.0.0',
            }),
        })
    ).toString('base64url');
    return `OAUTH2.${header}.${payload}.sig`;
}

async function withMockedFetch(
    handler: (url: string, init?: RequestInit) => { ok: boolean; body: unknown },
    fn: () => Promise<void>
): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const result = handler(url, init);
        return new Response(JSON.stringify(result.body), {
            status: result.ok ? 200 : 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
    try {
        await fn();
    } finally {
        globalThis.fetch = original;
    }
}

test('resolveWixInstallIdentity uses Wix callback instanceId when token APIs omit it', async () => {
    await withMockedFetch(
        () => ({ ok: false, body: {} }),
        async () => {
            const identity = await resolveWixInstallIdentity(
                { access_token: 'OAUopaque' },
                'unused-code',
                { instanceId: INSTANCE_ID }
            );
            assert.equal(identity.instanceId, INSTANCE_ID);
        }
    );
});

test('resolveWixInstallIdentity prefers Token Info over query instanceId', async () => {
    await withMockedFetch(
        (url) => {
            if (url.includes('/oauth2/token-info')) {
                return { ok: true, body: { instanceId: INSTANCE_ID, siteId: 'site-1' } };
            }
            return { ok: false, body: {} };
        },
        async () => {
            const identity = await resolveWixInstallIdentity(
                { access_token: 'OAUopaque' },
                'unused-code',
                { instanceId: '11111111-1111-1111-1111-111111111111' }
            );
            assert.equal(identity.instanceId, INSTANCE_ID);
            assert.equal(identity.siteId, 'site-1');
        }
    );
});

test('resolveWixInstallIdentity reads instanceId from OAUTH2 authorization code', async () => {
    await withMockedFetch(
        () => ({ ok: false, body: {} }),
        async () => {
            const identity = await resolveWixInstallIdentity(
                { access_token: 'OAUopaque' },
                oauth2Code(INSTANCE_ID),
                {}
            );
            assert.equal(identity.instanceId, INSTANCE_ID);
        }
    );
});

test('createWixAccessToken posts client_credentials with instance_id', async () => {
    process.env.WIX_APP_ID = 'app-id';
    process.env.WIX_APP_SECRET = 'app-secret';
    await withMockedFetch(
        (url, init) => {
            if (url.includes('/oauth2/token')) {
                const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
                assert.equal(body.grant_type, 'client_credentials');
                assert.equal(body.client_id, 'app-id');
                assert.equal(body.instance_id, INSTANCE_ID);
                return { ok: true, body: { access_token: 'easy-token', expires_in: 14400 } };
            }
            return { ok: false, body: {} };
        },
        async () => {
            const tokens = await createWixAccessToken(INSTANCE_ID);
            assert.equal(tokens.access_token, 'easy-token');
            assert.equal(tokens.expires_in, 14400);
            assert.equal(tokens.instanceId, INSTANCE_ID);
        }
    );
});

test('createWixAccessToken rejects invalid instanceId', async () => {
    process.env.WIX_APP_ID = 'app-id';
    process.env.WIX_APP_SECRET = 'app-secret';
    await assert.rejects(() => createWixAccessToken('not-a-uuid'), /Invalid Wix instanceId/);
});

test('resolveWixInstallIdentity rejects missing instanceId', async () => {
    await withMockedFetch(
        () => ({ ok: false, body: {} }),
        async () => {
            await assert.rejects(
                () =>
                    resolveWixInstallIdentity({ access_token: 'OAUopaque' }, 'not-a-jwt', {}),
                /Could not determine Wix instanceId/
            );
        }
    );
});
