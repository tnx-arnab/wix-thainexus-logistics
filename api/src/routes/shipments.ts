import { Router } from 'express';
import { findOrderShipmentByRequestNumber, getShipment, listShipmentsForStore, syncShipmentTracking } from '@thai-nexus/shared';
import { getSession } from '../auth.js';
import { getValidAccessToken } from '../wix/tokens.js';
import { pushTrackingToWixOrder } from '../wix/trackingPush.js';

const router = Router();

router.get('/', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    try {
        const data = await listShipmentsForStore(session.instanceId, page, limit);
        return res.json(data);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load shipments';
        const lower = message.toLowerCase();
        const status =
            lower.includes('api token') || lower.includes('not configured')
                ? 403
                : lower.includes('invalid api_token') || lower.includes('unauthorized')
                  ? 403
                  : 500;

        return res.status(status).json({ message });
    }
});

router.get('/:requestNumber', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    try {
        const detail = await getShipment(session.instanceId, req.params.requestNumber);
        return res.json(detail);
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load shipment details',
        });
    }
});

router.post('/:requestNumber/sync', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    try {
        const result = await syncShipmentTracking(session.instanceId, req.params.requestNumber);
        let ordersUpdated = 0;
        const tnx = result.shipment.tnx_tracking_number;
        const url = result.shipment.tracking_url || '';
        if (tnx && result.orderId) {
            try {
                const accessToken = await getValidAccessToken(session.instanceId);
                if (accessToken) {
                    const record = await findOrderShipmentByRequestNumber(
                        session.instanceId,
                        req.params.requestNumber
                    );
                    const numbers = record?.requestNumbers || [req.params.requestNumber];
                    const parcelIndex = Math.max(0, numbers.indexOf(req.params.requestNumber));
                    const pushed = await pushTrackingToWixOrder(
                        accessToken,
                        result.orderId,
                        tnx,
                        url,
                        { parcelIndex, parcelCount: Math.max(1, numbers.length) }
                    );
                    ordersUpdated = pushed.updated + (pushed.created ? 1 : 0);
                }
            } catch {
                // Persist + UI sync is enough if Wix fulfillments cannot be written.
            }
        }

        return res.json({
            shipment: result.shipment,
            orderId: result.orderId || null,
            orders_updated: ordersUpdated,
        });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to sync shipment',
        });
    }
});

export default router;
