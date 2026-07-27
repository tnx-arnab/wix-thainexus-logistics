import { Router } from 'express';
import {
    clearDebugLogs,
    clearQuoteCache,
    isDebugEnabled,
    listDebugLogs,
    listMerchantSpiEvents,
    listRateTraces,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';

const router = Router();

router.get('/spi-traces', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    try {
        const [merchantEvents, globalTraces] = await Promise.all([
            listMerchantSpiEvents(session.instanceId, 30),
            listRateTraces(40),
        ]);

        const globalForStore = globalTraces.filter(
            (t) => !t.store_id || t.store_id === session.instanceId
        );

        return res.json({
            instanceId: session.instanceId,
            hint:
                merchantEvents.length === 0
                    ? 'No checkout SPI calls yet for this store. Wix must call POST /v1/getRates when checkout loads shipping. Open Shipping settings → Manage Your Apps → enable Thai Nexus Express, then checkout again from the cart.'
                    : undefined,
            merchantEvents,
            globalTraces: globalForStore,
        });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load SPI traces',
            merchantEvents: [],
            globalTraces: [],
        });
    }
});

router.get('/', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    if (!isDebugEnabled()) {
        return res.json([]);
    }

    const logs = await listDebugLogs(session.instanceId);
    return res.json(logs);
});

router.delete('/', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    if (!isDebugEnabled()) {
        return res.json({ cleared: 0 });
    }

    const removed = await clearDebugLogs(session.instanceId);
    return res.json({ cleared: removed });
});

router.delete('/cache', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    const cleared = clearQuoteCache(session.instanceId);
    return res.json({ cleared });
});

export default router;
