import { Router } from 'express';
import { logRateTrace, logMerchantSpiEvent } from '@thai-nexus/shared';
import { rawBodyMiddleware } from '../bodyMiddleware.js';
import { extractBearerToken, parseSpiPayload } from '../wix/verify.js';
import {
    calculateWixShippingRates,
    type WixGetShippingRatesRequest,
    type WixShippingMetadata,
} from '../wix/wixShippingRatesAdapter.js';

const router = Router();

async function traceNow(entry: Parameters<typeof logRateTrace>[0]) {
    try {
        await logRateTrace(entry);
    } catch (err) {
        console.warn('[rate_trace]', err instanceof Error ? err.message : err);
    }
}

/**
 * Wix Shipping Rates SPI.
 * App Dashboard deploymentUri should point at APP_URL (e.g. https://wix.thainexus.co.th/).
 * Wix posts JWT (text/plain) or JSON to these paths.
 */
async function handleGetShippingRates(req: any, res: any) {
    const started = Date.now();
    try {
        const auth = extractBearerToken(req.headers.authorization);
        let rawBody: unknown = req.body;

        if (Buffer.isBuffer(rawBody)) {
            rawBody = rawBody.toString('utf8');
        }
        const bodyText = typeof rawBody === 'string' ? rawBody.trim() : '';
        // Wix may send JWT in Authorization and/or body (Workers must read body via rawBodyMiddleware).
        if (auth && (!bodyText || bodyText.split('.').length < 3)) {
            rawBody = auth;
        } else if (bodyText) {
            rawBody = bodyText;
        } else if (auth) {
            rawBody = auth;
        }

        const { request, metadata, instanceId } = parseSpiPayload(rawBody);
        const meta: WixShippingMetadata = {
            ...(metadata as WixShippingMetadata),
            instanceId: instanceId || (metadata.instanceId as string | undefined),
        };

        const wixReq = request as WixGetShippingRatesRequest;
        const dest = wixReq.shippingDestination || {};
        const instance = meta.instanceId || '(missing)';

        if (!meta.instanceId) {
            const diag = `jwt-parse-failed auth=${Boolean(auth)} bodyLen=${bodyText.length} ct=${String(req.headers['content-type'] || '')}`;
            console.warn('[SPI]', diag);
            await traceNow({
                phase: 'result',
                path: req.path,
                ok: false,
                message: diag,
                duration_ms: Date.now() - started,
            });
            return res.status(200).json({ shippingRates: [] });
        }

        await logMerchantSpiEvent(meta.instanceId, {
            phase: 'received',
            path: req.path,
            destination: String(dest.country || ''),
            items: wixReq.lineItems?.length ?? 0,
        });

        console.info('[SPI hit]', {
            path: req.path,
            instanceId: instance,
            country: dest.country,
            city: dest.city,
            zip: dest.postalCode,
            items: wixReq.lineItems?.length ?? 0,
        });

        await traceNow({
            phase: 'received',
            path: req.path,
            store_id: meta.instanceId,
            destination: String(dest.country || ''),
            destination_city: dest.city,
            destination_zip: dest.postalCode,
            items: wixReq.lineItems?.length ?? 0,
            user_agent: req.headers['user-agent'],
        });

        const { shippingRates, hint } = await Promise.race([
            calculateWixShippingRates(wixReq, meta),
            new Promise<{ shippingRates: []; hint: string }>((resolve) =>
                setTimeout(
                    () => resolve({ shippingRates: [], hint: 'spi-timeout-8s' }),
                    8000
                )
            ),
        ]);

        console.info('[SPI result]', {
            instanceId: instance,
            quotes: shippingRates.length,
            ms: Date.now() - started,
            hint: hint || undefined,
        });

        await traceNow({
            phase: 'result',
            path: req.path,
            store_id: meta.instanceId,
            quotes: shippingRates.length,
            duration_ms: Date.now() - started,
            ok: shippingRates.length > 0,
            message: hint,
        });

        await logMerchantSpiEvent(meta.instanceId, {
            phase: 'result',
            path: req.path,
            destination: String(dest.country || ''),
            items: wixReq.lineItems?.length ?? 0,
            quotes: shippingRates.length,
            ms: Date.now() - started,
            ok: shippingRates.length > 0,
            message: hint,
        });

        return res.status(200).json({ shippingRates });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'getShippingRates failed';
        console.error('[SPI getShippingRates]', req.path, message);
        await traceNow({
            phase: 'result',
            path: req.path,
            ok: false,
            message,
            duration_ms: Date.now() - started,
        });
        // Never 5xx on business/upstream failures - empty rates
        return res.status(200).json({ shippingRates: [] });
    }
}

/** express.raw is stubbed on Workers; use rawBodyMiddleware instead. */
const parseSpiBody = [
    rawBodyMiddleware(),
    (req: any, _res: any, next: any) => {
        if (Buffer.isBuffer(req.body)) {
            const text = req.body.toString('utf8');
            try {
                req.body = JSON.parse(text);
            } catch {
                req.body = text;
            }
        }
        next();
    },
] as const;

// Path variants: REST tutorial (/v1/getRates), SDK (/plugins-and-webhooks/…), Velo-style
const spiPaths = [
    '/v1/getRates',
    '/api/shipping-rates/v1/getRates',
    '/getShippingRates',
    '/_functions/getShippingRates',
    '/plugins-and-webhooks/v1/getRates',
    '/plugins-and-webhooks/getShippingRates',
];

for (const path of spiPaths) {
    router.post(path, ...parseSpiBody, handleGetShippingRates);
}

// Some SPI configs POST to deploymentUri root with Bearer JWT only
router.post('/', ...parseSpiBody, (req, res) => {
    const hasSpiAuth =
        Boolean(extractBearerToken(req.headers.authorization)) ||
        (typeof req.body === 'string' && req.body.includes('.')) ||
        (req.body && typeof req.body === 'object' && 'data' in (req.body as object));
    if (!hasSpiAuth) {
        return res.status(404).json({ message: 'Not found' });
    }
    return handleGetShippingRates(req, res);
});

export default router;
