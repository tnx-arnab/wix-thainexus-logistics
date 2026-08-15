import jwt from 'jsonwebtoken';
import { Request } from 'express';
import {
    SessionContext,
    SessionProps,
    deleteStore,
    deleteStoreUser,
    getStore,
    hasStoreUser,
    normalizeSessionFromWix,
    resolveInstanceId,
    setStore,
    setStoreUser,
} from '@thai-nexus/shared';
import { cookieValue, BOOTSTRAP_COOKIE } from './httpSecurity.js';
import { dashboardIdentityFromQuery } from './wix/instanceParam.js';
import { getValidAccessToken } from './wix/tokens.js';

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is not set. Add it to the project root .env file.`);
    }

    return value;
}

function getJwtKey(): string {
    return requireEnv('JWT_KEY');
}

export function getAppBaseUrl(): string {
    const base = (
        process.env.APP_URL ||
        process.env.AUTH_CALLBACK?.replace(
            /\/api\/(auth|oauth\/v1\/signup)\/?$/i,
            ''
        ) ||
        ''
    ).replace(/\/$/, '');

    if (!base) {
        throw new Error('APP_URL is not set. Add your tunnel or production URL to .env.');
    }

    return base;
}

/** True only for JWTs signed with this app's JWT_KEY (not Wix signed `instance` tokens). */
export function isAppContextJwt(value: string): boolean {
    const key = process.env.JWT_KEY?.trim();
    if (!key || value.split('.').length !== 3) return false;
    try {
        jwt.verify(value, key, { algorithms: ['HS256'] });
        return true;
    } catch {
        return false;
    }
}

export function encodePayload(session: SessionProps): string {
    const instanceId = resolveInstanceId(session);

    return jwt.sign(
        {
            context: instanceId,
            instanceId,
            user: session.user,
            owner: session.owner,
            siteId: session.site_id,
        },
        getJwtKey(),
        { algorithm: 'HS256', expiresIn: '24h' }
    );
}

function hasUserId(user: SessionProps['user'] | undefined): boolean {
    return user !== undefined && user.id !== undefined && user.id !== null && user.id !== '';
}

/**
 * Resolve merchant session from `X-Wix-Context` / app JWT cookie
 * or a Wix-signed instance JWT when already installed.
 */
function contextTokenFromRequest(req: Request): string {
    const header = req.headers['x-wix-context'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    if (typeof req.query.context === 'string' && req.query.context.trim()) {
        return req.query.context.trim();
    }
    return cookieValue(req.headers.cookie, BOOTSTRAP_COOKIE);
}

export async function getSession(req: Request): Promise<SessionContext | null> {
    const context = contextTokenFromRequest(req);

    if (!context) return null;

    let instanceId: string;
    let user: SessionProps['user'];
    let owner: SessionProps['user'] | undefined;

    if (isAppContextJwt(context)) {
        try {
            const decoded = jwt.verify(context, getJwtKey(), { algorithms: ['HS256'] }) as {
                context?: string;
                instanceId?: string;
                user: SessionProps['user'];
                owner?: SessionProps['user'];
                siteId?: string;
            };
            instanceId = resolveInstanceId({
                context: decoded.instanceId || decoded.context,
                instance_id: decoded.instanceId || decoded.context,
            });
            user = decoded.user;
            owner = decoded.owner;
            if (!hasUserId(user)) return null;
        } catch {
            return null;
        }
    } else {
        const fromDashboard = dashboardIdentityFromQuery(context);
        if (!fromDashboard) {
            return null;
        }
        instanceId = fromDashboard.instanceId;
        user = { id: fromDashboard.userId, email: 'merchant@wix.com' };
        owner = user;
    }

    const store = await getStore(instanceId);
    const accessToken = await getValidAccessToken(instanceId);
    if (!accessToken) return null;

    const userId = String(user.id);
    if (hasUserId(user)) {
        if (!(await hasStoreUser(instanceId, userId))) {
            await setStoreUser({
                context: instanceId,
                instance_id: instanceId,
                user,
                owner: owner || user,
                access_token: accessToken,
            });
        }
    }

    return {
        accessToken,
        instanceId,
        user,
        siteId: store?.site_id || undefined,
    };
}

/** OAuth install - persist Wix access + refresh tokens. */
export async function persistOAuthSession(
    raw: Partial<SessionProps> & Record<string, unknown>
) {
    const session = normalizeSessionFromWix(raw);
    await setStore(session, { requireToken: true });
    await setStoreUser(session);
}

/**
 * Uninstall - revoke OAuth only. Merchant config (API token, shipper, boxes, fees)
 * stays so reinstalling the same instance keeps settings.
 */
export async function removeDataStore(
    raw: Partial<SessionProps> & Record<string, unknown>
) {
    try {
        const session = normalizeSessionFromWix(raw);
        const instanceId = session.instance_id!;
        await deleteStore(instanceId);
        console.info(`[uninstall] Revoked OAuth for ${instanceId}; merchant config preserved.`);
    } catch {
        // uninstall payload may be incomplete
    }
}

export async function removeStoreUser(
    raw: Partial<SessionProps> & Record<string, unknown>
) {
    const session = normalizeSessionFromWix(raw);
    await deleteStoreUser(session);
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function oauthHtmlPage(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;color:#272262}
.err{color:#bf1d2d;background:#fef2f2;padding:1rem;border-radius:8px}</style></head>
<body>${bodyHtml}</body></html>`;
}

export function oauthErrorPage(title: string, message: string): string {
    return oauthHtmlPage(title, `<div class="err">${escapeHtml(message)}</div>`);
}
