import { getStore, updateStoreTokens } from '@thai-nexus/shared';
import { refreshWixToken } from './oauth.js';

const INSTANCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asInstanceId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return INSTANCE_UUID_RE.test(trimmed) ? trimmed : undefined;
}

function unwrapJwtData(claims: Record<string, unknown>): Record<string, unknown> {
    let data: unknown = claims.data ?? claims;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return claims;
        }
    }
    if (data && typeof data === 'object') return data as Record<string, unknown>;
    return claims;
}

/** Decode JWT payload without verifying (used only to read instanceId claims). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
    try {
        const parts = token.split('.');
        // Wix codes/tokens are often `OAUTH2.<header>.<payload>.<sig>` (4 parts).
        const payloadPart = parts.length >= 4 ? parts[parts.length - 2] : parts[1];
        if (!payloadPart) return {};
        return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    } catch {
        return {};
    }
}

/** Extract instanceId from Wix access token / OAUTH2 code claims when OAuth body omits it. */
export function instanceIdFromAccessToken(accessToken: string): string | undefined {
    const claims = decodeJwtPayload(accessToken);
    const data = unwrapJwtData(claims);
    const instance = (
        data.instance && typeof data.instance === 'object' ? data.instance : data
    ) as Record<string, unknown>;

    return (
        asInstanceId(claims.instanceId) ||
        asInstanceId(data.instanceId) ||
        asInstanceId(data.instance_id) ||
        asInstanceId(instance.instanceId) ||
        asInstanceId(instance.instance_id)
    );
}

/** Opaque OAUxxx tokens have no exp; do not treat that as expired. */
export function accessTokenNeedsRefresh(
    accessToken: string,
    nowSec = Math.floor(Date.now() / 1000)
): boolean {
    const exp = Number(decodeJwtPayload(accessToken).exp);
    if (!Number.isFinite(exp)) return false;
    return exp <= nowSec + 120;
}

/**
 * Return a usable Wix access token for the instance.
 * Refreshes once when refresh_token is stored (best-effort).
 */
export async function getValidAccessToken(instanceId: string): Promise<string | null> {
    const row = await getStore(instanceId);
    if (!row?.access_token) return null;

    if (!row.refresh_token || !accessTokenNeedsRefresh(row.access_token)) {
        return row.access_token;
    }

    try {
        const refreshed = await refreshWixToken(row.refresh_token);
        await updateStoreTokens(instanceId, {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || row.refresh_token,
            scope: row.scope,
        });
        return refreshed.access_token;
    } catch (err) {
        console.warn(
            '[wix-token-refresh]',
            instanceId,
            err instanceof Error ? err.message : err
        );
        return row.access_token;
    }
}
