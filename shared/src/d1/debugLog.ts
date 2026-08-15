import { DebugLogEntry } from '../types/debug.js';
import { all, parseJson, run, toJson } from './client.js';

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

    await run(
        `INSERT INTO debug_logs (id, instance_id, logged_at, data)
         VALUES (?, ?, ?, ?)`,
        id,
        instanceId,
        entry.timestamp,
        toJson(doc)
    );

    const rows = await all<{ id: string }>(
        `SELECT id FROM debug_logs
         WHERE instance_id = ? AND (kind IS NULL OR kind = '')
         ORDER BY logged_at DESC`,
        instanceId
    );
    if (rows.length <= MAX_PER_STORE) return;

    const toDelete = rows.slice(MAX_PER_STORE).map((r) => r.id);
    await run(
        `DELETE FROM debug_logs WHERE id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(toDelete)
    );
}

export async function listDebugLogs(instanceId: string, limit = 50): Promise<DebugLogEntry[]> {
    const rows = await all<{ data: string }>(
        `SELECT data FROM debug_logs
         WHERE instance_id = ? AND (kind IS NULL OR kind = '')
         ORDER BY logged_at DESC
         LIMIT ?`,
        instanceId,
        limit
    );

    return rows.map((row) => parseJson<unknown>(row.data, null)).filter(isRateDebugEntry);
}

export async function clearDebugLogs(instanceId: string): Promise<number> {
    const fullRows = await all<{ id: string; data: string }>(
        `SELECT id, data FROM debug_logs WHERE instance_id = ?`,
        instanceId
    );

    const ids = fullRows.filter((row) => isRateDebugEntry(parseJson<unknown>(row.data, null))).map((row) => row.id);

    if (!ids.length) return 0;

    await run(`DELETE FROM debug_logs WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids));
    return ids.length;
}

export async function trimDebugLogsByKind(
    kind: string,
    max: number,
    instanceId?: string
): Promise<void> {
    if (instanceId) {
        await run(
            `DELETE FROM debug_logs
             WHERE instance_id = ? AND kind = ?
               AND id NOT IN (
                 SELECT id FROM (
                   SELECT id FROM debug_logs
                   WHERE instance_id = ? AND kind = ?
                   ORDER BY logged_at DESC
                   LIMIT ?
                 )
               )`,
            instanceId,
            kind,
            instanceId,
            kind,
            max
        );
        return;
    }

    await run(
        `DELETE FROM debug_logs
         WHERE kind = ?
           AND id NOT IN (
             SELECT id FROM (
               SELECT id FROM debug_logs
               WHERE kind = ?
               ORDER BY logged_at DESC
               LIMIT ?
             )
           )`,
        kind,
        kind,
        max
    );
}

export async function insertDebugLogRow(row: {
    id: string;
    instanceId: string;
    loggedAt: string;
    data: unknown;
}): Promise<void> {
    await run(
        `INSERT INTO debug_logs (id, instance_id, logged_at, data) VALUES (?, ?, ?, ?)`,
        row.id,
        row.instanceId,
        row.loggedAt,
        toJson(row.data)
    );
}

export async function listDebugLogRowsByKind<T>(
    kind: string,
    limit: number,
    instanceId?: string
): Promise<Array<{ id: string; instance_id: string; logged_at: string; data: T }>> {
    const rows = instanceId
        ? await all<{ id: string; instance_id: string; logged_at: string; data: string }>(
              `SELECT id, instance_id, logged_at, data FROM debug_logs
               WHERE instance_id = ? AND kind = ?
               ORDER BY logged_at DESC
               LIMIT ?`,
              instanceId,
              kind,
              limit
          )
        : await all<{ id: string; instance_id: string; logged_at: string; data: string }>(
              `SELECT id, instance_id, logged_at, data FROM debug_logs
               WHERE kind = ?
               ORDER BY logged_at DESC
               LIMIT ?`,
              kind,
              limit
          );

    const parsed: Array<{ id: string; instance_id: string; logged_at: string; data: T }> = [];
    for (const row of rows) {
        const data = parseJson<T | null>(row.data, null);
        if (data == null) continue;
        parsed.push({
            id: row.id,
            instance_id: row.instance_id,
            logged_at: row.logged_at,
            data,
        });
    }
    return parsed;
}
