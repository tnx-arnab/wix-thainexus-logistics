import { Router } from 'express';
import { getConfigPublic, getStoreToken, isDebugEnabled } from '@thai-nexus/shared';
import { instanceIdFromDashboardQuery } from '../wix/instanceParam.js';
import { encodePayload, getSession, isAppContextJwt } from '../auth.js';

const router = Router();

/**
 * Bootstrap Dashboard session.
 * Accepts a Wix-signed instance JWT or app context JWT and returns public config + context JWT.
 */
router.get('/', async (req, res) => {
    try {
        const session = await getSession(req);
        if (session) {
            const config = await getConfigPublic(session.instanceId);
            return res.json({
                ...config,
                instanceId: session.instanceId,
                debugEnabled: isDebugEnabled(),
                context: typeof req.query.context === 'string' ? req.query.context : undefined,
            });
        }

        const instanceParam =
            (typeof req.query.instanceId === 'string' && req.query.instanceId) ||
            (typeof req.query.instance_id === 'string' && req.query.instance_id) ||
            (typeof req.query.instance === 'string' ? req.query.instance : '') ||
            '';
        const instanceId = instanceParam ? instanceIdFromDashboardQuery(instanceParam) : '';

        if (!instanceId) {
            return res.status(401).json({
                message:
                    'Open this app from Wix Dashboard → Apps → Thai Nexus (do not bookmark the URL).',
            });
        }

        const accessToken = await getStoreToken(instanceId);
        if (!accessToken) {
            return res.status(401).json({
                code: 'STORE_NOT_LINKED',
                instanceId,
                message:
                    'This site is not connected yet. Reinstall Thai Nexus from the Wix App Market.',
            });
        }

        const context = encodePayload({
            instance_id: instanceId,
            context: instanceId,
            user: { id: 'owner', email: 'merchant@wix.com' },
            owner: { id: 'owner', email: 'merchant@wix.com' },
            access_token: accessToken,
            scope: 'wix',
        });

        const config = await getConfigPublic(instanceId);
        return res.json({
            ...config,
            instanceId,
            debugEnabled: isDebugEnabled(),
            context,
        });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Session failed',
        });
    }
});

/** Exchange a Wix-signed instance JWT for an app JWT when the store is already installed. */
router.get('/context', async (req, res) => {
    const raw =
        (typeof req.query.context === 'string' && req.query.context) ||
        (typeof req.query.instanceId === 'string' && req.query.instanceId) ||
        (typeof req.query.instance === 'string' && req.query.instance) ||
        '';

    if (!raw.trim()) {
        return res.status(400).json({ message: 'Missing context or instanceId' });
    }

    if (isAppContextJwt(raw)) {
        return res.json({ context: raw });
    }

    const instanceId = instanceIdFromDashboardQuery(raw);
    if (!instanceId) {
        return res.status(400).json({ message: 'Could not resolve instance id from context' });
    }
    try {
        const accessToken = await getStoreToken(instanceId);
        if (!accessToken) {
            return res.status(401).json({
                code: 'STORE_NOT_LINKED',
                instanceId,
                message:
                    'This site is not connected yet. Reinstall Thai Nexus from the Wix App Market.',
            });
        }

        const context = encodePayload({
            instance_id: instanceId,
            context: instanceId,
            user: { id: 'owner', email: 'merchant@wix.com' },
            owner: { id: 'owner', email: 'merchant@wix.com' },
            access_token: accessToken,
            scope: 'wix',
        });

        return res.json({ context });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Session exchange failed',
        });
    }
});

router.get('/status', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ linked: false });
    }

    return res.json({ linked: true, instanceId: session.instanceId });
});

export default router;
