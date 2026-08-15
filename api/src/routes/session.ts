import { Router } from 'express';
import { getConfigPublic, getStoreToken, isDebugEnabled } from '@thai-nexus/shared';
import { encodePayload, getSession, isAppContextJwt } from '../auth.js';
import { bootstrapCookieHeader, clientErrorMessage, requestIsHttps } from '../httpSecurity.js';
import { dashboardIdentityFromQuery } from '../wix/instanceParam.js';

const router = Router();

function rawContextFromRequest(req: {
    headers: Record<string, unknown>;
    query: Record<string, unknown>;
}): string {
    const header = req.headers['x-wix-context'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    const queryKeys = ['context', 'instanceId', 'instance_id', 'instance'] as const;
    for (const key of queryKeys) {
        const value = req.query[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function setSessionCookie(
    req: { protocol?: string; headers: { [key: string]: unknown } },
    res: { setHeader(name: string, value: string): void },
    jwt: string
) {
    res.setHeader('Set-Cookie', bootstrapCookieHeader(jwt, 24 * 60 * 60, requestIsHttps(req)));
}

/**
 * Bootstrap Dashboard session.
 * Accepts a Wix-signed instance JWT or app context JWT and returns public config + context JWT.
 */
router.get('/', async (req, res) => {
    try {
        const session = await getSession(req);
        if (session) {
            const context = encodePayload({
                instance_id: session.instanceId,
                context: session.instanceId,
                user: session.user,
                owner: session.user,
                access_token: session.accessToken,
                scope: 'wix',
            });
            setSessionCookie(req, res, context);
            const config = await getConfigPublic(session.instanceId);
            return res.json({
                ...config,
                instanceId: session.instanceId,
                debugEnabled: isDebugEnabled(),
                context,
            });
        }

        const identity = dashboardIdentityFromQuery(rawContextFromRequest(req));
        if (!identity) {
            return res.status(401).json({
                message:
                    'Open this app from Wix Dashboard → Apps → Thai Nexus (do not bookmark the URL).',
            });
        }

        const accessToken = await getStoreToken(identity.instanceId);
        if (!accessToken) {
            return res.status(401).json({
                code: 'STORE_NOT_LINKED',
                instanceId: identity.instanceId,
                message:
                    'This site is not connected yet. Reinstall Thai Nexus from the Wix App Market.',
            });
        }

        const context = encodePayload({
            instance_id: identity.instanceId,
            context: identity.instanceId,
            user: { id: identity.userId, email: 'merchant@wix.com' },
            owner: { id: identity.userId, email: 'merchant@wix.com' },
            access_token: accessToken,
            scope: 'wix',
        });
        setSessionCookie(req, res, context);

        const config = await getConfigPublic(identity.instanceId);
        return res.json({
            ...config,
            instanceId: identity.instanceId,
            debugEnabled: isDebugEnabled(),
            context,
        });
    } catch (err) {
        return res.status(500).json({
            message: clientErrorMessage(err, 'Session failed'),
        });
    }
});

/** Exchange a Wix-signed instance JWT for an app JWT when the store is already installed. */
router.get('/context', async (req, res) => {
    const raw = rawContextFromRequest(req);

    if (!raw.trim()) {
        return res.status(400).json({ message: 'Missing context or instanceId' });
    }

    if (isAppContextJwt(raw)) {
        setSessionCookie(req, res, raw);
        return res.json({ context: raw });
    }

    const identity = dashboardIdentityFromQuery(raw);
    if (!identity) {
        return res.status(400).json({ message: 'Could not resolve instance id from context' });
    }
    try {
        const accessToken = await getStoreToken(identity.instanceId);
        if (!accessToken) {
            return res.status(401).json({
                code: 'STORE_NOT_LINKED',
                instanceId: identity.instanceId,
                message:
                    'This site is not connected yet. Reinstall Thai Nexus from the Wix App Market.',
            });
        }

        const context = encodePayload({
            instance_id: identity.instanceId,
            context: identity.instanceId,
            user: { id: identity.userId, email: 'merchant@wix.com' },
            owner: { id: identity.userId, email: 'merchant@wix.com' },
            access_token: accessToken,
            scope: 'wix',
        });
        setSessionCookie(req, res, context);

        return res.json({ context });
    } catch (err) {
        return res.status(500).json({
            message: clientErrorMessage(err, 'Session exchange failed'),
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
