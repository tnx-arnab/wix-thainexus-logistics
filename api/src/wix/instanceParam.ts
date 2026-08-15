import crypto from 'node:crypto';
import { instanceIdFromWixClaims, verifyWixJwt, type WixVerifiedClaims } from './verify.js';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowPlainInstanceUuid(): boolean {
    if (String(process.env.NODE_ENV || '').trim() === 'production') return false;
    const v = process.env.ALLOW_PLAIN_INSTANCE_ID?.trim().toLowerCase();
    return v === 'true' || v === '1';
}

function wixUserIdFromClaims(claims: WixVerifiedClaims): string {
    const uid = claims.uid ?? claims.userId ?? claims.siteOwnerId;
    if (uid != null && String(uid).trim()) return String(uid).trim();
    return 'owner';
}

export type DashboardIdentity = {
    instanceId: string;
    userId: string;
};

/**
 * Wix Dashboard iframe sends the legacy app instance query parameter
 * (`signature.data`, HMAC-SHA256 over `data` with the app secret) - NOT a JWT.
 * See https://dev.wix.com/docs/build-apps/develop-your-app/access/app-instances/parse-the-app-instance-query-parameter
 */
function identityFromAppInstanceParam(value: string): DashboardIdentity | null {
    const secret = process.env.WIX_APP_SECRET?.trim();
    if (!secret) return null;

    const idx = value.indexOf('.');
    if (idx <= 0) return null;
    const signaturePart = value.slice(0, idx);
    const dataPart = value.slice(idx + 1);
    if (!signaturePart || !dataPart) return null;

    let provided: Buffer;
    try {
        provided = Buffer.from(signaturePart.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    } catch {
        return null;
    }

    const expected = crypto.createHmac('sha256', secret).update(dataPart).digest();
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
    }

    try {
        const json = JSON.parse(
            Buffer.from(dataPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        ) as Record<string, unknown>;
        const instanceId = json.instanceId;
        if (typeof instanceId === 'string' && UUID_RE.test(instanceId)) {
            const uid = json.uid ?? json.siteOwnerId ?? json.userId;
            const userId = uid != null && String(uid).trim() ? String(uid).trim() : 'owner';
            return { instanceId, userId };
        }
    } catch {
        return null;
    }

    return null;
}

/** Wix Dashboard iframe sends a signed `instance` value (app instance param or JWT). */
export function dashboardIdentityFromQuery(value: string): DashboardIdentity | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parts = trimmed.split('.');

    if (parts.length === 3) {
        try {
            const claims = verifyWixJwt(trimmed);
            const instanceId = instanceIdFromWixClaims(claims);
            if (instanceId && UUID_RE.test(instanceId)) {
                return { instanceId, userId: wixUserIdFromClaims(claims) };
            }
        } catch {
            return null;
        }
        return null;
    }

    if (parts.length === 2) {
        const fromInstance = identityFromAppInstanceParam(trimmed);
        if (fromInstance) return fromInstance;
    }

    if (allowPlainInstanceUuid() && UUID_RE.test(trimmed)) {
        return { instanceId: trimmed, userId: 'owner' };
    }

    return null;
}

export function instanceIdFromDashboardQuery(value: string): string | null {
    return dashboardIdentityFromQuery(value)?.instanceId ?? null;
}
