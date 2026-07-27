import { parseWixInstanceParam } from './oauth.js';
import { verifyWixJwt } from './verify.js';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wix Dashboard iframe sends `instance` (signed) or plain instanceId. */
export function instanceIdFromDashboardQuery(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (UUID_RE.test(trimmed)) return trimmed;

    if (trimmed.split('.').length === 3) {
        try {
            const claims = verifyWixJwt(trimmed);
            const data = claims.data as Record<string, unknown> | undefined;
            const id =
                (claims.instanceId as string) ||
                (data?.instanceId as string) ||
                (data?.instance_id as string);
            if (id && UUID_RE.test(String(id))) return String(id);
        } catch {
            // fall through
        }
    }

    const parsed = parseWixInstanceParam(trimmed);
    return parsed.instanceId && UUID_RE.test(parsed.instanceId) ? parsed.instanceId : null;
}
