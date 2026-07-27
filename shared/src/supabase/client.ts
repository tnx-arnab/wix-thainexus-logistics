import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Server-side key: new `sb_secret_...` or legacy `service_role` JWT. */
function getSupabaseSecretKey(): string | undefined {
    return (
        process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    );
}

function normalizeSupabaseUrl(url: string): string {
    return url.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
}

export function getSupabase(): SupabaseClient {
    if (!client) {
        const url = process.env.SUPABASE_URL?.trim();
        const key = getSupabaseSecretKey();

        if (!url || !key) {
            throw new Error(
                'SUPABASE_URL and SUPABASE_SECRET_KEY are required. See docs/SUPABASE.md'
            );
        }

        client = createClient(normalizeSupabaseUrl(url), key, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }

    return client;
}
