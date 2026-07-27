import { getStore, updateStoreTokens } from '@thai-nexus/shared';
import { refreshWixToken } from './oauth.js';

/** Decode JWT payload without verifying (used only to read instanceId claims). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return {};
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        return {};
    }
}

/** Extract instanceId from Wix access token claims when OAuth body omits it. */
export function instanceIdFromAccessToken(accessToken: string): string | undefined {
    const claims = decodeJwtPayload(accessToken);
    const data = (claims.data || claims) as Record<string, unknown>;
    const instance = (data.instance || data) as Record<string, unknown>;

    const id =
        (claims.instanceId as string) ||
        (data.instanceId as string) ||
        (instance.instanceId as string) ||
        (instance.instance_id as string);

    return id?.trim() || undefined;
}

/**
 * Return a usable Wix access token for the instance.
 * Refreshes once when refresh_token is stored (best-effort).
 */
export async function getValidAccessToken(instanceId: string): Promise<string | null> {
    const row = await getStore(instanceId);
    if (!row?.access_token) return null;

    if (!row.refresh_token) {
        return row.access_token;
    }

    // Proactive refresh only when token looks expired (exp claim).
    const claims = decodeJwtPayload(row.access_token);
    const exp = Number(claims.exp);
    const skewSec = 120;
    const stillValid =
        Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000) + skewSec;

    if (stillValid) {
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
