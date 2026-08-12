import { Router } from 'express';
import {
    getOrderShipments,
    isOrderShipmentRecordComplete,
    listInstallLogs,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';
import { searchRecentOrders } from '../wix/ordersApi.js';
import { normalizeOrderWebhookBody, processOrderWebhook } from '../wix/orderWebhook.js';
import { getValidAccessToken } from '../wix/tokens.js';

const router = Router();

/** Diagnostics: webhook hits logged under debug_logs (kind install). */
router.get('/webhook-status', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const logs = await listInstallLogs(50);
    const orderWebhooks = logs.filter(
        (l) =>
            l.route === '/api/webhooks/orders' &&
            l.data?.instance_id === session.instanceId
    );

    return res.json({
        instanceId: session.instanceId,
        orderWebhookHits: orderWebhooks.length,
        lastOrderWebhook: orderWebhooks[0] || null,
        hint:
            orderWebhooks.length === 0
                ? 'No Wix POST to /api/webhooks/orders yet. Release pending app version (Distribute), use Webhooks → Trigger a test, then place a new PAID order. Backfill old orders via Shipments → Sync from Wix orders.'
                : undefined,
    });
});

/**
 * Backfill shipments when webhooks did not fire (e.g. callback added after checkout).
 * Processes recent PAID orders that used Thai Nexus shipping.
 */
router.post('/sync-recent', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const accessToken = await getValidAccessToken(session.instanceId);
    if (!accessToken) {
        return res.status(401).json({ message: 'Store not linked' });
    }

    const limit = Math.min(Number(req.body?.limit) || 10, 25);

    try {
        const orders = await searchRecentOrders(accessToken, limit);
        const results: Array<{
            orderId: string;
            number?: string;
            paymentStatus?: string;
            ok: boolean;
            reason: string;
            skipped?: boolean;
        }> = [];

        for (const order of orders) {
            const orderId = String(order.id || order._id || '');
            const paymentStatus = String(
                order.paymentStatus || order.payment_status || ''
            ).toUpperCase();

            const webhookBody = {
                eventType: 'wix.ecom.v1.order_created',
                createdEvent: { entity: order },
            };
            const { payload, skipReason } = normalizeOrderWebhookBody(webhookBody);
            if (skipReason) {
                results.push({
                    orderId,
                    number: String(order.number || order.orderNumber || ''),
                    paymentStatus: paymentStatus || undefined,
                    ok: false,
                    reason: skipReason,
                    skipped: true,
                });
                continue;
            }

            const existing = await getOrderShipments(session.instanceId, orderId);
            if (existing && isOrderShipmentRecordComplete(existing)) {
                results.push({
                    orderId,
                    number: String(order.number || order.orderNumber || ''),
                    paymentStatus: paymentStatus || 'PAID',
                    ok: false,
                    reason: 'already-processed',
                    skipped: true,
                });
                continue;
            }

            const outcome = await processOrderWebhook(session.instanceId, payload);
            results.push({
                orderId,
                number: String(order.number || order.orderNumber || ''),
                paymentStatus: paymentStatus || 'PAID',
                ok: outcome.ok,
                reason: outcome.reason,
            });
        }

        return res.json({
            scanned: orders.length,
            results,
            hint: 'Use after enabling webhooks for new orders; this backfills missed ones.',
        });
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Order sync failed',
        });
    }
});

export default router;
