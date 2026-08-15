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

/** Wix Dashboard iframe sends signed `instance` JWT. Unsigned payloads are rejected. */
export function dashboardIdentityFromQuery(value: string): DashboardIdentity | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.split('.').length === 3) {
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

    if (allowPlainInstanceUuid() && UUID_RE.test(trimmed)) {
        return { instanceId: trimmed, userId: 'owner' };
    }

    return null;
}

export function instanceIdFromDashboardQuery(value: string): string | null {
    return dashboardIdentityFromQuery(value)?.instanceId ?? null;
}
