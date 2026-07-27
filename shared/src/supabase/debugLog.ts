import { DebugLogEntry } from '../types/debug.js';
import { getSupabase } from './client.js';

const MAX_PER_STORE = 50;

export function isDebugEnabled(): boolean {
    const mode = String(process.env.DEBUG_MODE ?? '').trim().toLowerCase();
    return mode === 'true' || mode === '1' || process.env.NODE_ENV !== 'production';
}

function isRateDebugEntry(data: unknown): data is DebugLogEntry {
    if (!data || typeof data !== 'object') return false;
    const row = data as Record<string, unknown>;
    if (row.kind === 'install') return false;
    return Array.isArray(row.products);
}

export async function appendDebugLog(
    instanceId: string,
    entry: Omit<DebugLogEntry, 'id' | 'instanceId'>
): Promise<void> {
    if (!isDebugEnabled()) return;

    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const doc: DebugLogEntry = {
        ...entry,
        id,
        instanceId,
    };

    const supabase = getSupabase();
    const { error } = await supabase.from('debug_logs').insert({
        id,
        instance_id: instanceId,
        logged_at: entry.timestamp,
        data: doc,
    });

    if (error) throw error;

    const { data: rows, error: listError } = await supabase
        .from('debug_logs')
        .select('id, logged_at')
        .eq('instance_id', instanceId)
        .order('logged_at', { ascending: false });

    if (listError) throw listError;
    if (!rows || rows.length <= MAX_PER_STORE) return;

    const toDelete = rows.slice(MAX_PER_STORE).map((r) => r.id);
    const { error: deleteError } = await supabase.from('debug_logs').delete().in('id', toDelete);

    if (deleteError) throw deleteError;
}

export async function listDebugLogs(instanceId: string, limit = 50): Promise<DebugLogEntry[]> {
    const { data, error } = await getSupabase()
        .from('debug_logs')
        .select('data')
        .eq('instance_id', instanceId)
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data || [])
        .map((row) => row.data)
        .filter(isRateDebugEntry);
}

export async function clearDebugLogs(instanceId: string): Promise<number> {
    const supabase = getSupabase();
    const { data: fullRows, error: fetchError } = await supabase
        .from('debug_logs')
        .select('id, data')
        .eq('instance_id', instanceId);

    if (fetchError) throw fetchError;

    const ids = (fullRows || [])
        .filter((row) => isRateDebugEntry(row.data))
        .map((row) => row.id);

    if (!ids.length) return 0;

    const { error } = await supabase.from('debug_logs').delete().in('id', ids);

    if (error) throw error;

    return ids.length;
}
