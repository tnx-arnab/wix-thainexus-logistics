import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express, { Express } from 'express';
import { jsonBodyMiddleware, wixWebhookBodyMiddleware } from './bodyMiddleware.js';
import { applySecurityHeaders, isProduction } from './httpSecurity.js';
import { rateLimitMiddleware } from './rateLimit.js';
import configRouter from './routes/config.js';
import oauthRouter from './routes/oauth.js';
import productsRouter from './routes/products.js';
import debugRouter from './routes/debug.js';
import shipmentsRouter from './routes/shipments.js';
import shippingRouter from './routes/shipping.js';
import shippingRatesRouter from './routes/shippingRates.js';
import sessionRouter from './routes/session.js';
import setupRouter from './routes/setup.js';
import ordersRouter from './routes/orders.js';
import webhooksRouter from './routes/webhooks.js';

export type CreateAppOptions = {
    /** Serve admin/dist (local Node). Cloudflare uses the ASSETS binding instead. */
    serveStatic?: boolean;
};

function isAllowedCorsOrigin(origin: string): boolean {
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        return false;
    }

    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
        return !isProduction();
    }
    if (host === 'wix.com' || host.endsWith('.wix.com')) return true;
    if (host === 'wixstudio.com' || host.endsWith('.wixstudio.com')) return true;

    for (const raw of [process.env.APP_URL, process.env.ADMIN_DEV_URL]) {
        const value = raw?.trim();
        if (!value) continue;
        try {
            if (new URL(value).origin === origin) return true;
        } catch {
            // ignore invalid env URLs
        }
    }

    return false;
}

export function createApp(options: CreateAppOptions = {}): Express {
    const { serveStatic = false } = options;
    const app = express();
    app.disable('x-powered-by');
    app.use(applySecurityHeaders);
    app.use(rateLimitMiddleware);

    app.use(
        cors({
            origin(origin, callback) {
                if (!origin || isAllowedCorsOrigin(origin)) {
                    return callback(null, true);
                }
                return callback(null, false);
            },
            credentials: true,
        })
    );
    app.use('/api/webhooks', wixWebhookBodyMiddleware(), webhooksRouter);
    app.use(shippingRatesRouter);
    app.use(jsonBodyMiddleware());

    app.get('/health', async (_req, res) => {
        let d1: { ok: boolean; message?: string } = { ok: false };

        try {
            const { probeDb } = await import('@thai-nexus/shared');
            await probeDb();
            d1 = { ok: true };
        } catch (err) {
            d1 = {
                ok: false,
                message: 'D1 not configured',
            };
        }

        res.json({
            ok: true,
            platform: 'wix',
            runtime: serveStatic ? 'node' : 'cloudflare-workers',
            d1: d1.ok ? { ok: true } : { ok: false, message: d1.message },
        });
    });

    app.use('/api', oauthRouter);
    app.use('/api/session', sessionRouter);
    app.use('/api/setup', setupRouter);
    app.use('/api/config', configRouter);
    app.use('/api/products', productsRouter);
    app.use('/api/shipments', shipmentsRouter);
    app.use('/api/orders', ordersRouter);
    app.use('/api/debug', debugRouter);
    app.use('/api/shipping', shippingRouter);

    if (serveStatic) {
        const __dirname = dirname(fileURLToPath(import.meta.url!));
        const adminDist = join(__dirname, '../../admin/dist');
        app.use(express.static(adminDist));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api')) return next();
            if (req.path.startsWith('/v1/')) return next();
            return res.sendFile(join(adminDist, 'index.html'));
        });
    }

    return app;
}
