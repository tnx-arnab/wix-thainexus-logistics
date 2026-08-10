import { Router } from 'express';
import { logInstallEvent, redactInstanceData } from '@thai-nexus/shared';
import { removeDataStore } from '../auth.js';
import type { WixWebhookRequest } from '../bodyMiddleware.js';
import { deferWebhookWork } from '../workerContext.js';
import { normalizeOrderWebhookBody, processOrderWebhook } from '../wix/orderWebhook.js';
import { instanceIdFromWixClaims } from '../wix/verify.js';
import { verifiedWebhookClaims } from '../wix/webhookAuth.js';

const router = Router();

function instanceFromRequest(req: WixWebhookRequest, body: Record<string, unknown>): string | null {
    if (req.wixWebhook?.instanceId) return req.wixWebhook.instanceId;

    const claims = verifiedWebhookClaims(req.headers.authorization);
    const fromClaims = claims ? instanceIdFromWixClaims(claims) : undefined;
    if (fromClaims) return fromClaims;

    if (body.instanceId) return String(body.instanceId);
    const meta = (body.metadata || body.data || body) as Record<string, unknown>;
    if (meta.instanceId) return String(meta.instanceId);
    return null;
}

function webhookAuthFailed(req: WixWebhookRequest): boolean {
    if (req.wixWebhook?.instanceId) return false;
    if (req.wixWebhookParseError) return true;
    const claims = verifiedWebhookClaims(req.headers.authorization);
    return claims === null;
}

function ackOrderWebhook(
    res: import('express').Response,
    body: Record<string, unknown>,
    extra?: Record<string, unknown>
): void {
    res.status(200).json({ received: true, ...extra });
}

/** Order paid / created - HTTP 200 within Wix ~1250ms deadline; shipments run in background. */
router.post('/orders', async (req: WixWebhookRequest, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = String(
        body.slug || body.eventType || req.wixWebhook?.eventType || ''
    ).slice(0, 120);

    try {
        if (webhookAuthFailed(req)) {
            const reason = req.wixWebhookParseError || 'invalid-jwt';
            ackOrderWebhook(res, body, { ok: false, reason });
            deferWebhookWork(
                logInstallEvent({
                    route: '/api/webhooks/orders',
                    ok: false,
                    message: `${reason} slug=${slug}`,
                })
            );
            return;
        }

        const instanceId = instanceFromRequest(req, body);
        if (!instanceId) {
            ackOrderWebhook(res, body, { ok: false, reason: 'missing-instance' });
            deferWebhookWork(
                logInstallEvent({
                    route: '/api/webhooks/orders',
                    ok: false,
                    message: `missing-instance slug=${slug}`,
                })
            );
            return;
        }

        const { payload, skipReason } = normalizeOrderWebhookBody(body);
        if (skipReason) {
            ackOrderWebhook(res, body, { ok: false, reason: skipReason });
            deferWebhookWork(
                logInstallEvent({
                    route: '/api/webhooks/orders',
                    ok: false,
                    message: `${skipReason} slug=${slug}`,
                    instance_id: instanceId,
                })
            );
            return;
        }

        ackOrderWebhook(res, body, { ok: true, queued: true });
        deferWebhookWork(
            (async () => {
                const result = await processOrderWebhook(instanceId, payload);
                await logInstallEvent({
                    route: '/api/webhooks/orders',
                    ok: result.ok,
                    message: `${result.reason} slug=${slug}`,
                    instance_id: instanceId,
                });
            })()
        );
    } catch (err) {
        const reason = err instanceof Error ? err.message : 'webhook-error';
        console.error('[webhooks/orders]', reason);
        ackOrderWebhook(res, body, { ok: false, reason });
        deferWebhookWork(
            logInstallEvent({
                route: '/api/webhooks/orders',
                ok: false,
                message: `${reason} slug=${slug}`,
            })
        );
    }
});

/** App installed / removed / permissions updated. */
router.post('/app-lifecycle', async (req: WixWebhookRequest, res) => {
    try {
        if (webhookAuthFailed(req)) {
            res.status(200).json({
                received: true,
                ok: false,
                reason: req.wixWebhookParseError || 'invalid-jwt',
            });
            return;
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const eventType = String(
            body.eventType ||
                body.action ||
                req.wixWebhook?.eventType ||
                ''
        ).toLowerCase();
        const instanceId = instanceFromRequest(req, body);

        res.status(200).json({ received: true, ok: true });

        deferWebhookWork(
            (async () => {
                await logInstallEvent({
                    route: '/api/webhooks/app-lifecycle',
                    ok: true,
                    message: eventType || 'lifecycle',
                    instance_id: instanceId || undefined,
                });

                if (
                    instanceId &&
                    (eventType.includes('remove') ||
                        eventType.includes('uninstall') ||
                        eventType.includes('deleted'))
                ) {
                    await removeDataStore({
                        instance_id: instanceId,
                        user: { id: '0', email: '' },
                    });
                }
            })()
        );
    } catch (err) {
        console.error('[webhooks/app-lifecycle]', err);
        res.status(200).json({ received: true, ok: false });
    }
});

/** GDPR / privacy - site redact wipes tenant data. */
router.post('/privacy', async (req: WixWebhookRequest, res) => {
    try {
        if (webhookAuthFailed(req)) {
            res.status(200).json({
                received: true,
                ok: false,
                reason: req.wixWebhookParseError || 'invalid-jwt',
            });
            return;
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const eventType = String(body.eventType || body.action || '').toLowerCase();
        const instanceId = instanceFromRequest(req, body);

        res.status(200).json({ received: true, ok: true });

        if (instanceId && (eventType.includes('redact') || eventType.includes('delete'))) {
            deferWebhookWork(
                (async () => {
                    await redactInstanceData(instanceId);
                    await logInstallEvent({
                        route: '/api/webhooks/privacy',
                        ok: true,
                        message: 'redacted',
                        instance_id: instanceId,
                    });
                })()
            );
        }
    } catch (err) {
        console.error('[webhooks/privacy]', err);
        res.status(200).json({ received: true, ok: false });
    }
});

export default router;
