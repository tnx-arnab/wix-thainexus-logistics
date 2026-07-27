import { Router } from 'express';
import { logInstallEvent, redactInstanceData } from '@thai-nexus/shared';
import { removeDataStore } from '../auth.js';
import { normalizeOrderWebhookBody, processOrderWebhook } from '../wix/orderWebhook.js';
import { extractBearerToken, verifyWixJwt } from '../wix/verify.js';

const router = Router();

function instanceFromPayload(body: unknown, claims?: Record<string, unknown>): string | null {
    if (claims?.instanceId) return String(claims.instanceId);
    if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const meta = (b.metadata || b.data || b) as Record<string, unknown>;
        if (meta.instanceId) return String(meta.instanceId);
        if (b.instanceId) return String(b.instanceId);
    }
    return null;
}

/** Order paid / created - always HTTP 200. */
router.post('/orders', async (req, res) => {
    try {
        const auth = extractBearerToken(req.headers.authorization);
        let claims: Record<string, unknown> = {};
        if (auth && process.env.WEBHOOK_SKIP_VERIFY !== 'true') {
            claims = verifyWixJwt(auth) as Record<string, unknown>;
        } else if (auth) {
            try {
                claims = verifyWixJwt(auth) as Record<string, unknown>;
            } catch {
                claims = {};
            }
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const instanceId = instanceFromPayload(body, claims);
        if (!instanceId) {
            return res.status(200).json({ received: true, ok: false, reason: 'missing-instance' });
        }

        const { payload, skipReason } = normalizeOrderWebhookBody(body);
        if (skipReason) {
            return res.status(200).json({ received: true, ok: false, reason: skipReason });
        }

        const result = await processOrderWebhook(instanceId, payload);
        return res.status(200).json({ received: true, ...result });
    } catch (err) {
        const reason = err instanceof Error ? err.message : 'webhook-error';
        console.error('[webhooks/orders]', reason);
        return res.status(200).json({ received: true, ok: false, reason });
    }
});

/** App installed / removed / permissions updated. */
router.post('/app-lifecycle', async (req, res) => {
    try {
        const auth = extractBearerToken(req.headers.authorization);
        let claims: Record<string, unknown> = {};
        if (auth) {
            try {
                claims = verifyWixJwt(auth) as Record<string, unknown>;
            } catch (err) {
                if (process.env.WEBHOOK_SKIP_VERIFY !== 'true') throw err;
            }
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const eventType = String(
            body.eventType || body.action || claims.eventType || ''
        ).toLowerCase();
        const instanceId = instanceFromPayload(body, claims);

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

        return res.status(200).json({ received: true, ok: true });
    } catch (err) {
        console.error('[webhooks/app-lifecycle]', err);
        return res.status(200).json({ received: true, ok: false });
    }
});

/** GDPR / privacy - site redact wipes tenant data. */
router.post('/privacy', async (req, res) => {
    try {
        const auth = extractBearerToken(req.headers.authorization);
        if (auth && process.env.WEBHOOK_SKIP_VERIFY !== 'true') {
            verifyWixJwt(auth);
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const eventType = String(body.eventType || body.action || '').toLowerCase();
        const instanceId = instanceFromPayload(body);

        if (instanceId && (eventType.includes('redact') || eventType.includes('delete'))) {
            await redactInstanceData(instanceId);
            await logInstallEvent({
                route: '/api/webhooks/privacy',
                ok: true,
                message: 'redacted',
                instance_id: instanceId,
            });
        }

        return res.status(200).json({ received: true, ok: true });
    } catch (err) {
        console.error('[webhooks/privacy]', err);
        return res.status(200).json({ received: true, ok: false });
    }
});

export default router;
