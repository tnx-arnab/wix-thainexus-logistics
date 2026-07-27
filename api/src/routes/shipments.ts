import { Router } from 'express';
import { getShipment, listShipmentsForStore } from '@thai-nexus/shared';
import { getSession } from '../auth.js';

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

export default router;
