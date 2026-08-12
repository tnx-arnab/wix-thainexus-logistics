import { decryptStoredSecret, encryptSecret } from '../crypto.js';
import { resolveInstanceId } from '../session.js';
import { SessionProps } from '../types/index.js';
import { getSupabase } from './client.js';

export type StoreRow = {
    instance_id: string;
    access_token: string;
    refresh_token?: string | null;
    scope: string;
    site_id?: string | null;
    meta_site_id?: string | null;
};

export async function setStore(session: SessionProps, options?: { requireToken?: boolean }) {
    const { access_token: accessToken, scope, refresh_token: refreshToken } = session;
    if (!accessToken) {
        if (options?.requireToken) {
            throw new Error(
                'Wix did not return an access token. Reinstall the app and confirm WIX_APP_ID, WIX_APP_SECRET, and AUTH_CALLBACK match the App Dashboard.'
            );
        }

        return;
    }

    const instanceId = resolveInstanceId(session);
    const { error } = await getSupabase().from('stores').upsert({
        instance_id: instanceId,
        access_token: encryptSecret(accessToken),
        refresh_token: refreshToken ? encryptSecret(refreshToken) : null,
        scope: scope || '',
        site_id: session.site_id || null,
        meta_site_id: session.meta_site_id || null,
        updated_at: new Date().toISOString(),
    });

    if (error) throw error;
}

export async function setStoreUser(session: SessionProps) {
    const { user, owner, access_token: accessToken } = session;
    const instanceId = resolveInstanceId(session);
    const id = `${user.id}_${instanceId}`;
    const supabase = getSupabase();

    const { data: existing } = await supabase.from('store_users').select('id').eq('id', id).maybeSingle();

    if (existing) return;

    const { error } = await supabase.from('store_users').insert({
        id,
        instance_id: instanceId,
        is_admin: Boolean(accessToken) || owner?.id === user.id,
    });

    if (error) throw error;
}

export async function hasStoreUser(instanceId: string, userId: string) {
    const { data, error } = await getSupabase()
        .from('store_users')
        .select('id')
        .eq('id', `${userId}_${instanceId}`)
        .maybeSingle();

    if (error) throw error;

    return Boolean(data);
}

export async function getStoreToken(instanceId: string) {
    const row = await getStore(instanceId);
    return row?.access_token;
}

export async function getStore(instanceId: string): Promise<StoreRow | null> {
    const { data, error } = await getSupabase()
        .from('stores')
        .select('instance_id, access_token, refresh_token, scope, site_id, meta_site_id')
        .eq('instance_id', instanceId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as StoreRow;
    return {
        ...row,
        access_token: decryptStoredSecret(row.access_token),
        refresh_token: row.refresh_token ? decryptStoredSecret(row.refresh_token) : row.refresh_token,
    };
}

export async function updateStoreTokens(
    instanceId: string,
    tokens: { access_token: string; refresh_token?: string; scope?: string }
) {
    const { error } = await getSupabase()
        .from('stores')
        .update({
            access_token: encryptSecret(tokens.access_token),
            refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
            scope: tokens.scope,
            updated_at: new Date().toISOString(),
        })
        .eq('instance_id', instanceId);

    if (error) throw error;
}

export async function deleteStore(instanceId: string) {
    const supabase = getSupabase();
    const { error: usersError } = await supabase.from('store_users').delete().eq('instance_id', instanceId);
    if (usersError) throw usersError;

    const { error } = await supabase.from('stores').delete().eq('instance_id', instanceId);
    if (error) throw error;
}

export async function deleteStoreUser(session: SessionProps) {
    const instanceId = resolveInstanceId(session);
    const { error } = await getSupabase()
        .from('store_users')
        .delete()
        .eq('id', `${session.user.id}_${instanceId}`);

    if (error) throw error;
}

/** GDPR / site redact - wipe all tenant data for an instance. */
export async function redactInstanceData(instanceId: string): Promise<void> {
    const supabase = getSupabase();
    const tables = [
        'product_flags',
        'order_shipments',
        'debug_logs',
        'install_logs',
        'thai_nexus_config',
        'store_users',
        'stores',
    ] as const;

    for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('instance_id', instanceId);
        if (error) throw error;
    }
}
