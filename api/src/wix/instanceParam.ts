import { instanceIdFromWixClaims, verifyWixJwt } from './verify.js';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowPlainInstanceUuid(): boolean {
    const v = process.env.ALLOW_PLAIN_INSTANCE_ID?.trim().toLowerCase();
    return v === 'true' || v === '1';
}

/** Wix Dashboard iframe sends signed `instance` JWT. Unsigned payloads are rejected. */
export function instanceIdFromDashboardQuery(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.split('.').length === 3) {
        try {
            const claims = verifyWixJwt(trimmed);
            const id = instanceIdFromWixClaims(claims);
            if (id && UUID_RE.test(id)) return id;
        } catch {
            return null;
        }
        return null;
    }

    if (allowPlainInstanceUuid() && UUID_RE.test(trimmed)) {
        return trimmed;
    }

    return null;
}
