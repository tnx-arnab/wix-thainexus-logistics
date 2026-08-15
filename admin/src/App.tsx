import { Bug, LayoutDashboard, Package, Ruler, Settings, DollarSign, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from './lib/cn';
import { isAppJwt, storeContextFromUrl } from './lib/wixContext';
import type { ApiError } from './lib/api';
import { api, fetchConfig } from './lib/api';
import { resolveAppContext } from './lib/resolveAppContext';
import type { StoreConfigPublic } from './lib/types';
import HomePage from './pages/HomePage';

const baseTabs = [
    { id: 'shipments', label: 'Shipments', icon: LayoutDashboard },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'products', label: 'Products', icon: Ruler },
    { id: 'fees', label: 'Fees', icon: DollarSign },
    { id: 'boxes', label: 'Boxes', icon: Package },
    { id: 'privacy', label: 'Privacy', icon: Shield },
] as const;

export default function App() {
    const [appContext, setAppContext] = useState<string | null>(() => {
        const c = storeContextFromUrl();
        return c && isAppJwt(c) ? c : null;
    });
    const [activeTab, setActiveTab] = useState<string>('settings');
    const [config, setConfig] = useState<StoreConfigPublic | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [healthHint, setHealthHint] = useState<string | null>(null);
    const [installUrl, setInstallUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [bootstrapping, setBootstrapping] = useState(true);

    const reload = (saved?: StoreConfigPublic) => {
        if (!appContext) return;
        if (saved) {
            setConfig(saved);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        fetchConfig()
            .then(setConfig)
            .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const resolved = await resolveAppContext();
                if (cancelled) return;

                if (!resolved) {
                    try {
                        const health = await fetch('/health').then((r) => r.json());
                        const db = health?.d1 || health?.supabase;
                        if (db && !db.ok) {
                            setHealthHint(
                                `Database error: ${db.message || 'D1 not reachable'}`
                            );
                        } else if (db?.ok) {
                            setHealthHint(
                                'Database is online, but this site is not installed yet. Reinstall the app from Wix.'
                            );
                        }
                    } catch {
                        // ignore health probe failures
                    }

                    setBootstrapping(false);
                    setLoading(false);
                    return;
                }

                setAppContext(resolved);
                const url = new URL(window.location.href);
                url.searchParams.set('context', resolved);
                window.history.replaceState({}, '', url.toString());

                api.defaults.params = {
                    ...api.defaults.params,
                    context: resolved,
                };

                const cfg = await fetchConfig();
                if (!cancelled) {
                    setConfig(cfg);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    const err = e as ApiError;
                    setError(err instanceof Error ? err.message : 'Failed to connect');
                    if (err.installUrl) setInstallUrl(err.installUrl);
                }
            } finally {
                if (!cancelled) {
                    setBootstrapping(false);
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    if (bootstrapping) {
        return (
            <div className="min-h-screen p-10 flex flex-col items-center justify-center">
                <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 mt-4 font-medium">Connecting to your store…</p>
            </div>
        );
    }

    if (!appContext) {
        return (
            <div className="min-h-screen p-10 max-w-2xl mx-auto">
                <div className="tnxl-card border-l-4 border-l-primary">
                    <h1 className="text-xl font-bold text-primary">Thai Nexus Logistics</h1>
                    {error ? (
                        <div className="mt-3 p-3 rounded-lg bg-red-50 text-secondary text-sm border border-red-100">
                            {error}
                        </div>
                    ) : healthHint ? (
                        <div className="mt-3 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm border border-amber-100">
                            {healthHint}
                        </div>
                    ) : (
                        <p className="mt-2 text-gray-600">
                            Could not detect your site session. Open from{' '}
                            <strong>Wix Dashboard → Apps → Thai Nexus</strong> (not a bookmark).
                        </p>
                    )}
                    {installUrl && (
                        <button
                            type="button"
                            className="mt-4 inline-flex items-center justify-center px-5 py-3 rounded-lg bg-primary text-white font-semibold text-sm shadow-md hover:opacity-95"
                            onClick={() => {
                                try {
                                    window.top!.location.href = installUrl;
                                } catch {
                                    window.open(installUrl, '_blank', 'noopener,noreferrer');
                                }
                            }}
                        >
                            Install / reconnect
                        </button>
                    )}
                    <ol className="mt-4 text-sm text-gray-600 list-decimal list-inside space-y-2">
                        <li>
                            Create the app in{' '}
                            <a
                                className="text-primary underline"
                                href="https://dev.wix.com/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Wix App Dashboard
                            </a>{' '}
                            and copy App ID / Secret / Public key into{' '}
                            <code className="text-xs bg-gray-100 px-1 rounded">.dev.vars</code>
                        </li>
                        <li>
                            Set App URL / Redirect to{' '}
                            <code className="text-xs bg-gray-100 px-1 rounded">
                                https://wix.thainexus.co.th/api/auth
                            </code>
                        </li>
                        <li>
                            Point Shipping Rates SPI <code className="text-xs">deploymentUri</code>{' '}
                            at{' '}
                            <code className="text-xs bg-gray-100 px-1 rounded">
                                https://wix.thainexus.co.th/
                            </code>
                        </li>
                        <li>
                            Apply D1 migrations with{' '}
                            <code className="text-xs bg-gray-100 px-1 rounded">
                                npx wrangler d1 migrations apply thai-nexus-wix --local
                            </code>
                        </li>
                        <li>
                            <a
                                className="text-primary underline"
                                href="/api/setup"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Install diagnostics
                            </a>
                            {' · '}
                            <a
                                className="text-primary underline"
                                href="/api/setup/logs"
                                target="_blank"
                                rel="noreferrer"
                            >
                                OAuth logs
                            </a>
                        </li>
                    </ol>
                    <p className="mt-4 text-xs text-gray-400">
                        API health:{' '}
                        <a className="text-primary underline" href="/health" target="_blank" rel="noreferrer">
                            /health
                        </a>
                    </p>
                </div>
            </div>
        );
    }

    const tabs = config?.debugEnabled
        ? [...baseTabs, { id: 'debug' as const, label: 'Debug', icon: Bug }]
        : [...baseTabs];

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto font-sans">
            <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                        <Package className="text-secondary w-8 h-8" />
                        Thai Nexus Logistics
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Manage shipping API settings and store origin.
                    </p>
                    {config?.instanceId && (
                        <p className="text-xs text-gray-400 mt-1">
                            Instance:{' '}
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                {config.instanceId}
                            </code>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all text-sm',
                                activeTab === id
                                    ? 'bg-primary text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            <Icon size={16} />
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 text-secondary border border-red-100">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="tnxl-card space-y-3">
                    <div className="tnxl-skeleton w-1/3" />
                    <div className="tnxl-skeleton w-full" />
                    <div className="tnxl-skeleton w-2/3" />
                </div>
            ) : (
                <HomePage tab={activeTab} config={config} onReload={reload} />
            )}
        </div>
    );
}
