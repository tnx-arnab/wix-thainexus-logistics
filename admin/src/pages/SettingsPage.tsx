import {
    AlertCircle,
    CheckCircle2,
    Key,
    Loader2,
    MapPin,
    Package,
    Pencil,
    Phone,
    Save,
    Truck,
    User,
    Wifi,
    Info,
    Mail,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import ProductSearchSelect from '../components/ProductSearchSelect';
import { fetchShippingServices, saveConfig, testConnection } from '../lib/api';
import { BOXED_PRODUCT_FIELD_GUIDE } from '../lib/boxedProductField';
import { validateShipperForm } from '../lib/validateShipperForm';
import type { ShipperProfile, StoreConfigPublic, ThaiNexusShippingService } from '../lib/types';

function normalizeServiceId(value: string): string {
    return value.trim().replace(/\s+/g, '_').toLowerCase();
}

const emptyShipper = (): ShipperProfile => ({
    name: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'TH',
    email: '',
});

interface SettingsPageProps {
    config: StoreConfigPublic | null;
    onSaved: (saved?: StoreConfigPublic) => void;
}

export default function SettingsPage({ config, onSaved }: SettingsPageProps) {
    const [apiToken, setApiToken] = useState('');
    const [shipper, setShipper] = useState<ShipperProfile>(emptyShipper());
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [testResult, setTestResult] = useState<{ valid: boolean; message?: string } | null>(null);
    const [replacingToken, setReplacingToken] = useState(false);
    const [services, setServices] = useState<ThaiNexusShippingService[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [servicesError, setServicesError] = useState<string | null>(null);
    const [disabledServiceIds, setDisabledServiceIds] = useState<string[]>([]);
    const [shippingIneligibleProductIds, setShippingIneligibleProductIds] = useState<Array<string | number>>([]);

    const tokenOnFile = Boolean(config?.hasApiToken) && !replacingToken && !apiToken;

    useEffect(() => {
        if (config?.shipper) {
            setShipper({ ...emptyShipper(), ...config.shipper });
        }
    }, [config?.updatedAt]);

    useEffect(() => {
        if (config?.hasApiToken) {
            setReplacingToken(false);
        }
    }, [config?.hasApiToken, config?.updatedAt]);

    useEffect(() => {
        setDisabledServiceIds(config?.disabledServiceIds || []);
    }, [config?.updatedAt, config?.disabledServiceIds]);

    useEffect(() => {
        setShippingIneligibleProductIds(config?.shippingIneligibleProductIds || []);
    }, [config?.updatedAt, config?.shippingIneligibleProductIds]);

    const loadServices = useCallback(async () => {
        if (!config?.hasApiToken) {
            setServices([]);
            setServicesError(null);
            return;
        }

        setServicesLoading(true);
        setServicesError(null);
        try {
            const list = await fetchShippingServices();
            setServices(list);
        } catch (err) {
            setServices([]);
            setServicesError(
                err instanceof Error ? err.message : 'Failed to load shipping services'
            );
        } finally {
            setServicesLoading(false);
        }
    }, [config?.hasApiToken]);

    useEffect(() => {
        void loadServices();
    }, [loadServices, config?.updatedAt]);

    const toggleService = (serviceId: string, enabled: boolean) => {
        const id = normalizeServiceId(serviceId);
        setDisabledServiceIds((prev) => {
            if (enabled) {
                return prev.filter((x) => x !== id);
            }
            if (prev.includes(id)) return prev;
            return [...prev, id];
        });
    };

    const setAllServices = (enabled: boolean) => {
        if (enabled) {
            setDisabledServiceIds([]);
            return;
        }
        setDisabledServiceIds(services.map((s) => normalizeServiceId(s.id)));
    };

    const enabledCount = services.filter(
        (s) => !disabledServiceIds.includes(normalizeServiceId(s.id))
    ).length;

    const handleTest = async () => {
        if (!apiToken.trim() && !config?.hasApiToken) {
            setTestResult({ valid: false, message: 'Enter your API token first.' });
            return;
        }

        setTesting(true);
        setTestResult(null);
        try {
            const result = await testConnection(apiToken.trim() || undefined);
            setTestResult({
                valid: result.valid,
                message: result.valid
                    ? result.message || 'Connection OK'
                    : result.message,
            });
        } catch (err) {
            setTestResult({
                valid: false,
                message: err instanceof Error ? err.message : 'Connection test failed',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);

        const shipperError = validateShipperForm(shipper);
        if (shipperError) {
            setMessage({ type: 'error', text: shipperError });
            return;
        }

        if (!apiToken.trim() && !config?.hasApiToken) {
            setMessage({
                type: 'error',
                text: 'Enter your Thai Nexus API token, or save the store address first.',
            });
            return;
        }

        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                shipper,
                commissionRules: config?.commissionRules || [],
                boxes: config?.boxes || [],
                disabledServiceIds,
                shippingIneligibleProductIds,
            };
            if (apiToken.trim()) {
                payload.apiToken = apiToken.trim();
            }

            const saved = await saveConfig(payload);
            setApiToken('');
            setReplacingToken(false);
            setTestResult(null);
            setMessage({
                type: 'success',
                text: 'Settings saved to your store. Data will persist after reload.',
            });
            onSaved(saved);
            setTimeout(() => setMessage(null), 6000);
        } catch (err) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to save settings.',
            });
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-gray-500 mt-4 font-medium">Loading your settings…</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-8">
            <div className="tnxl-card border-l-4 border-l-amber-500 bg-amber-50 text-amber-950 text-sm p-4">
                <strong>Important:</strong> <em>Test connection</em> only checks your token - it does
                not save anything. Fill in the <strong>store address</strong> below and click{' '}
                <strong>Save settings</strong>.
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Key className="text-white w-6 h-6" />
                        <h2 className="text-lg font-bold text-white">API Authentication</h2>
                    </div>
                    {config.hasApiToken && (
                        <span className="text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
                            Token saved
                        </span>
                    )}
                </div>
                <div className="p-8">
                    <div className="max-w-2xl space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Thai Nexus API Token
                            </label>

                            {tokenOnFile ? (
                                <div className="rounded-lg border-2 border-primary/20 bg-[#272262]/5 overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/10">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                            <CheckCircle2 className="text-primary" size={20} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-primary">
                                                API token saved
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Stored encrypted for this store
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white">
                                        <span
                                            className="font-mono text-sm tracking-widest text-gray-700 select-none"
                                            aria-hidden
                                        >
                                            ••••••••••••••••••••
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReplacingToken(true);
                                                setApiToken('');
                                                setTestResult(null);
                                            }}
                                            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                        >
                                            <Pencil size={14} />
                                            Replace token
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <input
                                    type="password"
                                    className="tnxl-input font-mono"
                                    placeholder="Paste your TNXL API token"
                                    value={apiToken}
                                    onChange={(e) => setApiToken(e.target.value)}
                                    autoComplete="off"
                                    autoFocus={replacingToken}
                                />
                            )}

                            {replacingToken && config.hasApiToken && (
                                <button
                                    type="button"
                                    className="mt-2 text-sm text-gray-500 hover:text-primary underline"
                                    onClick={() => {
                                        setReplacingToken(false);
                                        setApiToken('');
                                        setTestResult(null);
                                    }}
                                >
                                    Cancel - keep current token
                                </button>
                            )}

                            <p className="mt-3 text-sm text-gray-500 flex items-center gap-1.5">
                                <AlertCircle size={14} className="text-secondary shrink-0" />
                                Found in{' '}
                                <a
                                    href="https://app.thainexus.co.th/"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline font-medium"
                                >
                                    Profile Settings → API Token
                                </a>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={testing || (!apiToken.trim() && !config.hasApiToken)}
                            className="tnxl-btn-secondary disabled:opacity-50"
                        >
                            {testing ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <Wifi size={18} />
                            )}
                            {testing ? 'Testing…' : 'Test connection'}
                        </button>
                        {testResult?.valid && (
                            <div className="text-primary text-sm bg-[#272262]/5 px-4 py-3 rounded-lg space-y-1">
                                <div className="flex items-center gap-2 font-medium">
                                    <CheckCircle2 size={18} />
                                    Connection OK
                                </div>
                                <p className="text-gray-600">
                                    Scroll down, complete the store address, then click{' '}
                                    <strong>Save settings</strong>.
                                </p>
                            </div>
                        )}
                        {testResult && !testResult.valid && (
                            <div className="flex items-center gap-2 text-secondary font-medium text-sm bg-red-50 px-4 py-2 rounded-lg">
                                <AlertCircle size={18} />
                                {testResult.message}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Truck className="text-white w-6 h-6" />
                        <h2 className="text-lg font-bold text-white">Shipping Services</h2>
                    </div>
                    {config.hasApiToken && services.length > 0 && (
                        <span className="text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
                            {enabledCount} of {services.length} enabled
                        </span>
                    )}
                </div>
                <div className="p-8">
                    {!config.hasApiToken ? (
                        <p className="text-sm text-gray-500">
                            Save your Thai Nexus API token above to choose which shipping services
                            appear at checkout.
                        </p>
                    ) : servicesLoading ? (
                        <div className="flex items-center gap-3 text-gray-500">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-medium">Loading services…</span>
                        </div>
                    ) : servicesError ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-secondary text-sm bg-red-50 px-4 py-2 rounded-lg">
                                <AlertCircle size={18} />
                                {servicesError}
                            </div>
                            <button
                                type="button"
                                onClick={() => void loadServices()}
                                className="tnxl-btn-secondary text-sm"
                            >
                                Retry
                            </button>
                        </div>
                    ) : services.length === 0 ? (
                        <p className="text-sm text-gray-500">No shipping services available.</p>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                Uncheck services you do not want to offer at checkout. All services
                                are enabled by default.
                            </p>
                            <div className="flex flex-wrap gap-4 text-sm">
                                <button
                                    type="button"
                                    onClick={() => setAllServices(true)}
                                    className="text-primary font-medium hover:underline"
                                >
                                    Select all
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAllServices(false)}
                                    className="text-primary font-medium hover:underline"
                                >
                                    Deselect all
                                </button>
                            </div>
                            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                                {services.map((service) => {
                                    const id = normalizeServiceId(service.id);
                                    const enabled = !disabledServiceIds.includes(id);

                                    return (
                                        <li key={service.id}>
                                            <label className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50">
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={(e) =>
                                                        toggleService(service.id, e.target.checked)
                                                    }
                                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                                                />
                                                {service.logo ? (
                                                    <img
                                                        src={service.logo}
                                                        alt=""
                                                        className="h-8 w-8 object-contain shrink-0"
                                                    />
                                                ) : (
                                                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                                        <Truck
                                                            size={16}
                                                            className="text-primary"
                                                        />
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium text-gray-800">
                                                    {service.service_name}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="bg-primary p-5 flex flex-wrap items-center justify-between gap-3 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <Package className="text-white w-6 h-6" />
                        <h2 className="text-lg font-bold text-white">Product shipping eligibility</h2>
                    </div>
                    {shippingIneligibleProductIds.length > 0 && (
                        <span className="text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
                            {shippingIneligibleProductIds.length} excluded
                        </span>
                    )}
                </div>
                <div className="p-8 space-y-4">
                    <p className="text-sm text-gray-600">
                        <strong>All products are eligible by default.</strong> Search and add any
                        product that should <strong>not</strong> use Thai Nexus shipping. If the
                        cart contains any excluded product, Thai Nexus rates are hidden at checkout.
                        You can also manage eligibility per product on the product edit page.
                    </p>
                    <ProductSearchSelect
                        selectedProducts={shippingIneligibleProductIds}
                        onChange={setShippingIneligibleProductIds}
                        alreadySelectedLabel="Already excluded"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-primary p-5 flex items-center gap-3 rounded-t-xl">
                    <Package className="text-white w-6 h-6" />
                    <h2 className="text-lg font-bold text-white">Boxed Product</h2>
                </div>
                <div className="p-8">
                    <div
                        role="note"
                        className="flex gap-3 rounded-lg border border-primary/15 bg-[#eff6ff] px-4 py-4 text-sm text-gray-700"
                    >
                        <Info size={20} className="text-primary shrink-0 mt-0.5" aria-hidden />
                        <div className="space-y-3 min-w-0">
                            <p className="font-semibold text-primary">
                                {BOXED_PRODUCT_FIELD_GUIDE.title}
                            </p>
                            <p className="leading-relaxed">{BOXED_PRODUCT_FIELD_GUIDE.intro}</p>
                            <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                                {BOXED_PRODUCT_FIELD_GUIDE.steps.map((step) => (
                                    <li key={step}>{step}</li>
                                ))}
                            </ol>
                            <p className="text-primary leading-relaxed">{BOXED_PRODUCT_FIELD_GUIDE.note}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex items-center gap-3">
                    <MapPin className="text-white w-6 h-6" />
                    <h2 className="text-lg font-bold text-white">Store Origin Address (required)</h2>
                </div>
                <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <User size={16} className="text-gray-400" />
                                Shipper name
                            </label>
                            <input
                                type="text"
                                className="tnxl-input"
                                value={shipper.name}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, name: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <Phone size={16} className="text-gray-400" />
                                Phone number
                            </label>
                            <input
                                type="text"
                                className="tnxl-input"
                                value={shipper.phone}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, phone: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <Mail size={16} className="text-gray-400" />
                                Email
                            </label>
                            <input
                                type="email"
                                className="tnxl-input"
                                value={shipper.email || ''}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, email: e.target.value }))
                                }
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Street address
                            </label>
                            <textarea
                                className="tnxl-input h-24 resize-none"
                                value={shipper.street}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, street: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                City
                            </label>
                            <input
                                type="text"
                                className="tnxl-input"
                                value={shipper.city}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, city: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                State / Province
                            </label>
                            <input
                                type="text"
                                className="tnxl-input"
                                value={shipper.state}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, state: e.target.value }))
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Postal code
                            </label>
                            <input
                                type="text"
                                className="tnxl-input"
                                value={shipper.postalCode}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, postalCode: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Country
                            </label>
                            <select
                                className="tnxl-input bg-white"
                                value={shipper.country}
                                onChange={(e) =>
                                    setShipper((s) => ({ ...s, country: e.target.value }))
                                }
                            >
                                <option value="TH">Thailand (TH)</option>
                                <option value="US">United States (US)</option>
                                <option value="GB">United Kingdom (GB)</option>
                                <option value="AU">Australia (AU)</option>
                                <option value="SG">Singapore (SG)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 sticky bottom-4 bg-white/95 backdrop-blur p-4 rounded-xl border border-gray-200 shadow-lg">
                <button
                    type="submit"
                    disabled={saving}
                    className="tnxl-btn-primary py-3 px-10 text-lg shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    {saving ? 'Saving…' : 'Save settings'}
                </button>

                {message && (
                    <div
                        className={`flex items-center gap-2 font-medium px-4 py-2 rounded-lg ${
                            message.type === 'success'
                                ? 'text-primary bg-[#272262]/5'
                                : 'text-secondary bg-red-50'
                        }`}
                    >
                        {message.type === 'success' ? (
                            <CheckCircle2 size={18} />
                        ) : (
                            <AlertCircle size={18} />
                        )}
                        {message.text}
                    </div>
                )}
            </div>
        </form>
    );
}
