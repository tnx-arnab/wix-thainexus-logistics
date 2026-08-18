import { decryptStoredSecret, encryptSecret } from '../crypto.js';
import { resolveInstanceId } from '../session.js';
import { SessionProps } from '../types/index.js';
import { boolInt, first, getDb, run } from './client.js';

export type StoreRow = {
    instance_id: string;
    access_token: string;
    refresh_token?: string | null;
    scope: string;
    site_id?: string | null;
    meta_site_id?: string | null;
};

type StoreDbRow = {
    instance_id: string;
    access_token: string;
    refresh_token: string | null;
    scope: string;
    site_id: string | null;
    meta_site_id: string | null;
};

export async function setStore(session: SessionProps, options?: { requireToken?: boolean }) {
    const { access_token: accessToken, scope, refresh_token: refreshToken } = session;
    if (!accessToken) {
        if (options?.requireToken) {
            throw new Error(
                'Wix did not return an access token. Confirm WIX_APP_ID and WIX_APP_SECRET, then reopen the app from Wix Dashboard.'
            );
        }

        return;
    }

    const instanceId = resolveInstanceId(session);
    await run(
        `INSERT INTO stores (instance_id, access_token, refresh_token, scope, site_id, meta_site_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           scope = excluded.scope,
           site_id = excluded.site_id,
           meta_site_id = excluded.meta_site_id,
           updated_at = excluded.updated_at`,
        instanceId,
        encryptSecret(accessToken),
        refreshToken ? encryptSecret(refreshToken) : null,
        scope || '',
        session.site_id || null,
        session.meta_site_id || null,
        new Date().toISOString()
    );
}

export async function setStoreUser(session: SessionProps) {
    const { user, owner, access_token: accessToken } = session;
    const instanceId = resolveInstanceId(session);
    const id = `${user.id}_${instanceId}`;

    const existing = await first<{ id: string }>('SELECT id FROM store_users WHERE id = ?', id);
    if (existing) return;

    await run(
        `INSERT INTO store_users (id, instance_id, is_admin, created_at)
         VALUES (?, ?, ?, ?)`,
        id,
        instanceId,
        boolInt(Boolean(accessToken) || owner?.id === user.id),
        new Date().toISOString()
    );
}

export async function hasStoreUser(instanceId: string, userId: string) {
    const row = await first<{ id: string }>(
        'SELECT id FROM store_users WHERE id = ?',
        `${userId}_${instanceId}`
    );
    return Boolean(row);
}

export async function getStoreToken(instanceId: string) {
    const row = await getStore(instanceId);
    return row?.access_token;
}

export async function getStore(instanceId: string): Promise<StoreRow | null> {
    const data = await first<StoreDbRow>(
        `SELECT instance_id, access_token, refresh_token, scope, site_id, meta_site_id
         FROM stores WHERE instance_id = ?`,
        instanceId
    );
    if (!data) return null;

    return {
        ...data,
        access_token: decryptStoredSecret(data.access_token),
        refresh_token: data.refresh_token ? decryptStoredSecret(data.refresh_token) : data.refresh_token,
    };
}

export async function updateStoreTokens(
    instanceId: string,
    tokens: { access_token: string; refresh_token?: string; scope?: string }
) {
    await run(
        `UPDATE stores
         SET access_token = ?, refresh_token = ?, scope = COALESCE(?, scope), updated_at = ?
         WHERE instance_id = ?`,
        encryptSecret(tokens.access_token),
        tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        tokens.scope ?? null,
        new Date().toISOString(),
        instanceId
    );
}

export async function deleteStore(instanceId: string) {
    await run('DELETE FROM store_users WHERE instance_id = ?', instanceId);
    await run('DELETE FROM stores WHERE instance_id = ?', instanceId);
}

export async function deleteStoreUser(session: SessionProps) {
    const instanceId = resolveInstanceId(session);
    await run('DELETE FROM store_users WHERE id = ?', `${session.user.id}_${instanceId}`);
}

/** GDPR / site redact - wipe all tenant data for an instance. */
export async function redactInstanceData(instanceId: string): Promise<void> {
    const db = getDb();
    const tables = [
        'product_flags',
        'order_shipments',
        'debug_logs',
        'install_logs',
        'thai_nexus_config',
        'store_users',
        'stores',
    ] as const;

    await db.batch(
        tables.map((table) => db.prepare(`DELETE FROM ${table} WHERE instance_id = ?`).bind(instanceId))
    );
}
