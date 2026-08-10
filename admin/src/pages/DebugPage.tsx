import {
    Activity,
    ChevronDown,
    ChevronUp,
    Loader2,
    RefreshCw,
    Terminal,
    Trash2,
    Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { clearDebugCache, clearDebugLogs, fetchDebugLogs, fetchSpiTraces, type MerchantSpiEventRow } from '../lib/api';
import type { DebugLogEntry } from '../lib/types';

export default function DebugPage({ instanceId }: { instanceId?: string }) {
    const [logs, setLogs] = useState<DebugLogEntry[]>([]);
    const [spiEvents, setSpiEvents] = useState<MerchantSpiEventRow[]>([]);
    const [spiHint, setSpiHint] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [message, setMessage] = useState<string | null>(null);

    const loadSpi = useCallback(() => {
        fetchSpiTraces()
            .then((data) => {
                setSpiEvents(data.merchantEvents || []);
                setSpiHint(data.hint || null);
                if (data.merchantEvents?.length) {
                    console.info('[Thai Nexus SPI]', data.merchantEvents);
                } else {
                    console.warn(
                        '[Thai Nexus SPI] No checkout calls for this store yet.',
                        data.hint
                    );
                }
            })
            .catch((err) => {
                setSpiEvents([]);
                console.error('[Thai Nexus SPI]', err);
            });
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        loadSpi();
        fetchDebugLogs()
            .then((rows) =>
                setLogs(
                    (Array.isArray(rows) ? rows : []).filter(
                        (log) => Array.isArray(log?.products) && log.products
                    )
                )
            )
            .catch((err) => {
                setLogs([]);
                setMessage(
                    err instanceof Error ? err.message : 'Could not load debug logs'
                );
            })
            .finally(() => setLoading(false));
    }, [loadSpi]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!autoRefresh) return;

        const id = setInterval(load, 5000);

        return () => clearInterval(id);
    }, [autoRefresh, load]);

    const notify = (text: string) => {
        setMessage(text);
        setTimeout(() => setMessage(null), 3000);
    };

    const handleClearLogs = async () => {
        if (!confirm('Clear all debug logs? This cannot be undone.')) return;

        await clearDebugLogs();
        setLogs([]);
        notify('Debug logs cleared.');
    };

    const handleClearCache = async () => {
        if (!confirm('Clear cached shipping quotes?')) return;

        const { cleared } = await clearDebugCache();
        notify(`Cleared ${cleared} cached quote entries.`);
    };

    return (
        <div className="space-y-6">
            <div className="tnxl-card space-y-3">
                <h2 className="text-lg font-semibold text-primary flex items-center gap-2">
                    <Terminal className="w-5 h-5" />
                    Checkout SPI log (always on)
                </h2>
                <p className="text-sm text-gray-600">
                    Wix checkout does not run in this iframe. When shipping loads on the storefront,
                    Wix calls <code className="text-xs bg-gray-100 px-1 rounded">POST /v1/getRates</code>{' '}
                    on our server. Lines appear here and in DevTools → Console as{' '}
                    <code className="text-xs">[Thai Nexus SPI]</code>.
                </p>
                {spiHint && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
                        {spiHint}
                    </p>
                )}
                {!spiHint && spiEvents.length > 0 && (
                    <p className="text-sm text-green-700">
                        Wix reached your app ({spiEvents.length} recent event(s)).
                    </p>
                )}
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto space-y-2">
                    {spiEvents.length === 0 ? (
                        <p className="text-gray-400">
                            No SPI events for instance {instanceId || '—'} yet. Enable Thai Nexus in
                            Shipping → Manage Your Apps, then open checkout shipping step.
                        </p>
                    ) : (
                        spiEvents.map((ev, idx) => (
                            <div key={`${ev.logged_at}-${idx}`} className="border-b border-gray-700 pb-2">
                                <span className="text-gray-400">{ev.logged_at}</span>{' '}
                                <span className={ev.ok ? 'text-green-400' : 'text-yellow-400'}>
                                    {ev.phase}
                                </span>{' '}
                                dest={ev.destination || '-'} items={ev.items ?? 0} quotes=
                                {ev.quotes ?? '-'} {ev.message ? `— ${ev.message}` : ''}
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Terminal className="text-white w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Developer debug log</h2>
                            <p className="text-white/80 text-sm">
                                Checkout rate calculations and API payloads.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-white text-sm">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded"
                            />
                            Auto-refresh (5s)
                        </label>
                        <button
                            type="button"
                            onClick={load}
                            className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            disabled
                            title="Quote caching disabled — checkout always uses live Thai Nexus quotes."
                            className="bg-white/10 text-white/50 px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 cursor-not-allowed"
                        >
                            <Zap size={16} />
                            Cache off (live rates)
                        </button>
                        <button
                            type="button"
                            onClick={handleClearLogs}
                            className="bg-white text-secondary px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 font-medium"
                        >
                            <Trash2 size={16} />
                            Clear logs
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center gap-2 text-primary text-sm">
                    <Activity size={18} />
                    <span>
                        <strong>Debugging is active</strong> - trigger checkout shipping to capture
                        entries. Hidden when <code className="text-xs">DEBUG_MODE</code> is off in
                        production.
                    </span>
                </div>

                <div className="px-6 py-4 border-b border-gray-100 text-sm text-gray-700 space-y-2">
                    <p className="font-semibold text-gray-900">How to capture rate traces</p>
                    <p>
                        Wix calls the Shipping Rates SPI on your server (
                        <code className="text-xs">POST /v1/getRates</code>). Those requests are not
                        visible in the storefront browser. Trigger checkout shipping, then refresh
                        this tab to see products, boxes, destination, upstream quotes, and final
                        rates for this instance.
                    </p>
                </div>

                {message && (
                    <div className="px-6 py-2 text-sm text-primary bg-primary/5">{message}</div>
                )}

                {loading && logs.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="mt-3">Loading logs…</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        <Terminal className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                        <p className="font-semibold text-gray-700">No logs captured yet</p>
                        <p className="mt-1 text-sm">
                            Run a checkout shipping quote to see data here.
                        </p>
                        {instanceId && (
                            <p className="mt-3 text-xs text-gray-400">
                                Showing logs for store{' '}
                                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                    {instanceId}
                                </code>
                                . Checkouts on a different store won&apos;t appear here.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {logs.map((log) => (
                            <div key={log.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedId(expandedId === log.id ? null : log.id)
                                    }
                                    className="w-full p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-gray-50 text-left"
                                >
                                    <div>
                                        <p className="font-mono text-sm text-primary">
                                            {log.timestamp}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {log.products?.length ?? 0} items · {log.box_count ?? 0}{' '}
                                            boxes · {log.destination?.city ?? '-'},{' '}
                                            {log.destination?.country ?? '-'}
                                        </p>
                                    </div>
                                    {expandedId === log.id ? (
                                        <ChevronUp size={20} className="text-gray-400" />
                                    ) : (
                                        <ChevronDown size={20} className="text-gray-400" />
                                    )}
                                </button>

                                {expandedId === log.id && (
                                    <div className="px-5 pb-5 space-y-4 text-sm">
                                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                                            {JSON.stringify(log, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
