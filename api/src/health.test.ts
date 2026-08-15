import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bindWorkerDb, clearWorkerDb } from '@thai-nexus/shared';
import { createMigratedMemoryD1 } from '../../shared/src/d1/memoryD1.js';
import { createApp } from './app.js';

const schema = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../migrations/0001_init.sql'),
    'utf8'
);

async function withApp(
    bindDb: boolean,
    fn: (base: string) => Promise<void>
): Promise<void> {
    if (bindDb) bindWorkerDb(createMigratedMemoryD1(schema));
    else clearWorkerDb();

    const app = createApp({ serveStatic: false });
    const server = createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
        await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        clearWorkerDb();
    }
}

test('GET /health d1 ok when DB is bound', async () => {
    await withApp(true, async (base) => {
        const body = await (await fetch(`${base}/health`)).json();
        assert.equal(body.ok, true);
        assert.equal(body.d1.ok, true);
        assert.equal(body.runtime, 'cloudflare-workers');
    });
});

test('GET /health d1 not ok when DB missing', async () => {
    await withApp(false, async (base) => {
        const body = await (await fetch(`${base}/health`)).json();
        assert.equal(body.ok, true);
        assert.equal(body.d1.ok, false);
        assert.equal(typeof body.d1.message, 'string');
    });
});

test('GET /api/setup returns ready only', async () => {
    const prevJwt = process.env.JWT_KEY;
    process.env.JWT_KEY = 'jwt-key-for-setup-test';
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-16';
    process.env.WIX_APP_ID = process.env.WIX_APP_ID || 'app-id';
    process.env.WIX_APP_SECRET = process.env.WIX_APP_SECRET || 'app-secret';
    process.env.WIX_PUBLIC_KEY = process.env.WIX_PUBLIC_KEY || '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';

    try {
        await withApp(true, async (base) => {
            const body = await (await fetch(`${base}/api/setup`)).json();
            assert.equal(typeof body.ready, 'boolean');
            assert.equal('checks' in body, false);
        });

        process.env.JWT_KEY = '';
        await withApp(true, async (base) => {
            const body = await (await fetch(`${base}/api/setup`)).json();
            assert.equal(body.ready, false);
            assert.equal('checks' in body, false);
        });
    } finally {
        if (prevJwt === undefined) delete process.env.JWT_KEY;
        else process.env.JWT_KEY = prevJwt;
    }
});
