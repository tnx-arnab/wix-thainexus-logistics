import { Router } from 'express';
import { apiShippingServices, getApiToken, testConnection } from '@thai-nexus/shared';
import { getSession } from '../auth.js';

const router = Router();

router.get('/services', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = await getApiToken(session.instanceId);
    if (!token) {
        return res.status(400).json({ message: 'API token required' });
    }

    try {
        const result = await apiShippingServices(token);
        return res.json({ services: result.data });
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Failed to load shipping services',
        });
    }
});

router.post('/check-connection', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token =
        (req.body?.apiToken as string)?.trim() || (await getApiToken(session.instanceId));
    if (!token) {
        return res.status(400).json({ valid: false, message: 'API token required' });
    }

    return res.json(await testConnection(token));
});

export default router;
