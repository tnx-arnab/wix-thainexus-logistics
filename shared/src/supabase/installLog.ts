import { getSupabase } from './client.js';

export type InstallLogEntry = {
    route: string;
    ok: boolean;
    message?: string;
    instance_id?: string;
    query_keys?: string[];
    has_code?: boolean;
    has_context?: boolean;
    has_signed_jwt?: boolean;
    error_name?: string;
    error_stack?: string;
};

const MAX_LOGS = 100;
const SYSTEM_STORE = '__install__';

/** Always-on OAuth/install tracing (uses existing debug_logs table). */
export async function logInstallEvent(entry: InstallLogEntry): Promise<void> {
    const id = `ilog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const loggedAt = new Date().toISOString();

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('debug_logs').insert({
            id,
            instance_id: SYSTEM_STORE,
            logged_at: loggedAt,
            data: { kind: 'install', instance_id: entry.instance_id, ...entry },
        });

        if (error) {
            console.error('[install_log] insert failed:', error.message, entry.route);
            return;
        }

        const { data: rows, error: listError } = await supabase
            .from('debug_logs')
            .select('id, logged_at')
            .contains('data', { kind: 'install' })
            .order('logged_at', { ascending: false })
            .limit(MAX_LOGS + 20);

        if (listError || !rows || rows.length <= MAX_LOGS) return;

        const toDelete = rows.slice(MAX_LOGS).map((r) => r.id);
        await supabase.from('debug_logs').delete().in('id', toDelete);
    } catch (err) {
        console.error(
            '[install_log]',
            err instanceof Error ? err.message : err,
            entry.route,
            entry.message
        );
    }
}

const RATE_TRACE_STORE = '__rate_trace__';
const MAX_RATE_TRACES = 100;

export type RateTraceEntry = {
    phase: 'received' | 'result';
    store_id?: string;
    destination?: string;
    destination_city?: string;
    destination_zip?: string;
    items?: number;
    path?: string;
    user_agent?: string;
    quotes?: number;
    duration_ms?: number;
    ok?: boolean;
    message?: string;
};

/**
 * Always-on trace of every /api/rate hit (independent of DEBUG_MODE and of success).
 * This is the source of truth for "did BigCommerce actually reach our endpoint?".
 */
export type MerchantSpiEvent = {
    phase: 'received' | 'result';
    path?: string;
    destination?: string;
    items?: number;
    quotes?: number;
    ms?: number;
    ok?: boolean;
    message?: string;
    rateCodes?: string[];
};

const MAX_SPI_EVENTS_PER_STORE = 40;

/** Always-on checkout SPI log visible in app Debug tab (not gated by DEBUG_MODE). */
export async function logMerchantSpiEvent(
    instanceId: string,
    event: MerchantSpiEvent
): Promise<void> {
    const id = `spi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const loggedAt = new Date().toISOString();

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('debug_logs').insert({
            id,
            instance_id: instanceId,
            logged_at: loggedAt,
            data: { kind: 'spi_event', ...event },
        });
        if (error) {
            console.error('[spi_event] insert failed:', error.message);
            return;
        }

        const { data: rows } = await supabase
            .from('debug_logs')
            .select('id, logged_at')
            .eq('instance_id', instanceId)
            .contains('data', { kind: 'spi_event' })
            .order('logged_at', { ascending: false })
            .limit(MAX_SPI_EVENTS_PER_STORE + 10);

        if (!rows || rows.length <= MAX_SPI_EVENTS_PER_STORE) return;
        const toDelete = rows.slice(MAX_SPI_EVENTS_PER_STORE).map((r) => r.id);
        await supabase.from('debug_logs').delete().in('id', toDelete);
    } catch (err) {
        console.error('[spi_event]', err instanceof Error ? err.message : err);
    }
}

export async function listMerchantSpiEvents(
    instanceId: string,
    limit = 30
): Promise<Array<{ logged_at: string } & MerchantSpiEvent>> {
    const { data, error } = await getSupabase()
        .from('debug_logs')
        .select('logged_at, data')
        .eq('instance_id', instanceId)
        .contains('data', { kind: 'spi_event' })
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return (data || []).map((row) => ({
        logged_at: row.logged_at,
        ...(row.data as MerchantSpiEvent),
    }));
}

export async function logRateTrace(entry: RateTraceEntry): Promise<void> {
    const id = `rtr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const loggedAt = new Date().toISOString();

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('debug_logs').insert({
            id,
            instance_id: RATE_TRACE_STORE,
            logged_at: loggedAt,
            data: { kind: 'rate_trace', ...entry },
        });
        if (error) {
            console.error('[rate_trace] insert failed:', error.message);
            return;
        }

        const { data: rows } = await supabase
            .from('debug_logs')
            .select('id, logged_at')
            .contains('data', { kind: 'rate_trace' })
            .order('logged_at', { ascending: false })
            .limit(MAX_RATE_TRACES + 20);

        if (!rows || rows.length <= MAX_RATE_TRACES) return;
        const toDelete = rows.slice(MAX_RATE_TRACES).map((r) => r.id);
        await supabase.from('debug_logs').delete().in('id', toDelete);
    } catch (err) {
        console.error('[rate_trace]', err instanceof Error ? err.message : err);
    }
}

export async function listRateTraces(limit = 30): Promise<
    Array<{ logged_at: string } & RateTraceEntry>
> {
    const { data, error } = await getSupabase()
        .from('debug_logs')
        .select('logged_at, data')
        .contains('data', { kind: 'rate_trace' })
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return (data || []).map((row) => ({
        logged_at: row.logged_at,
        ...(row.data as RateTraceEntry),
    }));
}

export async function listInstallLogs(limit = 30): Promise<
    Array<{
        id: string;
        logged_at: string;
        instance_id: string;
        route: string;
        ok: boolean;
        message: string | null;
        data: InstallLogEntry;
    }>
> {
    const { data, error } = await getSupabase()
        .from('debug_logs')
        .select('id, instance_id, logged_at, data')
        .contains('data', { kind: 'install' })
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data || []).map((row) => {
        const payload = row.data as InstallLogEntry & { kind?: string };
        return {
            id: row.id,
            logged_at: row.logged_at,
            instance_id: row.instance_id,
            route: payload.route || 'unknown',
            ok: Boolean(payload.ok),
            message: payload.message || null,
            data: payload,
        };
    });
}
