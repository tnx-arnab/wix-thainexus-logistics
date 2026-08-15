import {
    insertDebugLogRow,
    listDebugLogRowsByKind,
    trimDebugLogsByKind,
} from './debugLog.js';

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
        await insertDebugLogRow({
            id,
            instanceId: SYSTEM_STORE,
            loggedAt,
            data: { kind: 'install', instance_id: entry.instance_id, ...entry },
        });
        await trimDebugLogsByKind('install', MAX_LOGS);
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
    items?: number;
    path?: string;
    quotes?: number;
    duration_ms?: number;
    ok?: boolean;
    message?: string;
};

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
export async function logMerchantSpiEvent(instanceId: string, event: MerchantSpiEvent): Promise<void> {
    const id = `spi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const loggedAt = new Date().toISOString();

    try {
        await insertDebugLogRow({
            id,
            instanceId,
            loggedAt,
            data: { kind: 'spi_event', ...event },
        });
        await trimDebugLogsByKind('spi_event', MAX_SPI_EVENTS_PER_STORE, instanceId);
    } catch (err) {
        console.error('[spi_event]', err instanceof Error ? err.message : err);
    }
}

export async function listMerchantSpiEvents(
    instanceId: string,
    limit = 30
): Promise<Array<{ logged_at: string } & MerchantSpiEvent>> {
    const rows = await listDebugLogRowsByKind<MerchantSpiEvent>('spi_event', limit, instanceId);
    return rows.map((row) => ({
        logged_at: row.logged_at,
        ...row.data,
    }));
}

export async function logRateTrace(entry: RateTraceEntry): Promise<void> {
    const id = `rtr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const loggedAt = new Date().toISOString();
    const instanceId = entry.store_id || RATE_TRACE_STORE;

    try {
        await insertDebugLogRow({
            id,
            instanceId,
            loggedAt,
            data: { kind: 'rate_trace', ...entry },
        });
        await trimDebugLogsByKind(
            'rate_trace',
            MAX_RATE_TRACES,
            entry.store_id ? entry.store_id : undefined
        );
    } catch (err) {
        console.error('[rate_trace]', err instanceof Error ? err.message : err);
    }
}

export async function listRateTraces(
    limit = 30,
    instanceId?: string
): Promise<Array<{ logged_at: string } & RateTraceEntry>> {
    const rows = await listDebugLogRowsByKind<RateTraceEntry>('rate_trace', limit, instanceId);
    return rows
        .filter((row) => !instanceId || row.instance_id === instanceId || row.data.store_id === instanceId)
        .map((row) => ({
            logged_at: row.logged_at,
            ...row.data,
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
    const rows = await listDebugLogRowsByKind<InstallLogEntry & { kind?: string; instance_id?: string }>(
        'install',
        limit
    );

    return rows.map((row) => {
        const payload = row.data;
        return {
            id: row.id,
            logged_at: row.logged_at,
            instance_id: payload.instance_id || row.instance_id,
            route: payload.route || 'unknown',
            ok: Boolean(payload.ok),
            message: payload.message || null,
            data: payload,
        };
    });
}
