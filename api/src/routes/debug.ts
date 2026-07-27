import { Router } from 'express';
import {
    clearDebugLogs,
    clearQuoteCache,
    isDebugEnabled,
    listDebugLogs,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';

const router = Router();

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
