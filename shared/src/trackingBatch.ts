const DEFAULT_BATCH = 40;
const TERMINAL = /delivered|cancelled|canceled|returned|void/i;

function isTerminalStatus(status?: string): boolean {
    return Boolean(status && TERMINAL.test(status));
}

export function pickTrackingRequestNumbers(
    rows: Array<{
        request_number?: string;
        tnx_tracking_number?: string;
        status?: string;
    }>,
    batch = DEFAULT_BATCH
): string[] {
    const missing: string[] = [];
    const active: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
        const number = String(row.request_number || '').trim();
        if (!number || seen.has(number)) continue;
        seen.add(number);
        if (isTerminalStatus(row.status)) continue;
        if (!String(row.tnx_tracking_number || '').trim()) missing.push(number);
        else active.push(number);
    }

    return [...missing, ...active].slice(0, batch);
}
