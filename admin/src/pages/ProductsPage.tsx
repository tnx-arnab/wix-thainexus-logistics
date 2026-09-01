import { CheckCircle2, Loader2, Ruler, XCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import ProductSearchCombobox from '../components/ProductSearchCombobox';
import { fetchProductPhysical, saveProductPhysical } from '../lib/api';
import type { ProductPhysicalResult, ProductSearchResult } from '../lib/types';

export default function ProductsPage() {
    const [selected, setSelected] = useState<ProductSearchResult | null>(null);
    const [physical, setPhysical] = useState<ProductPhysicalResult | null>(null);
    const [lengthCm, setLengthCm] = useState('');
    const [widthCm, setWidthCm] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [weightLb, setWeightLb] = useState('');
    const [hsCode, setHsCode] = useState('');
    const [loadingPhysical, setLoadingPhysical] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    async function pickProduct(p: ProductSearchResult) {
        setSelected(p);
        setLoadingPhysical(true);
        setError(null);
        setMessage(null);
        setPhysical(null);
        try {
            const data = await fetchProductPhysical(String(p.id));
            setPhysical(data);
            setLengthCm(data.lengthCm ? String(data.lengthCm) : '');
            setWidthCm(data.widthCm ? String(data.widthCm) : '');
            setHeightCm(data.heightCm ? String(data.heightCm) : '');
            setWeightLb(
                data.weightKg
                    ? String(Math.round((data.weightKg / 0.45359237) * 100) / 100)
                    : '1'
            );
            setHsCode(data.hsCode || '');
        } catch (err) {
            setPhysical(null);
            setError(err instanceof Error ? err.message : 'Could not load product');
        } finally {
            setLoadingPhysical(false);
        }
    }

    function clearProduct() {
        setSelected(null);
        setPhysical(null);
        setError(null);
        setMessage(null);
    }

    async function saveDims(e: FormEvent) {
        e.preventDefault();
        if (!selected) return;
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const data = await saveProductPhysical(String(selected.id), {
                lengthCm: Number(lengthCm),
                widthCm: Number(widthCm),
                heightCm: Number(heightCm),
                weightLb: Number(weightLb),
                hsCode,
            });
            setPhysical(data);
            setHsCode(data.hsCode || '');
            setMessage(
                data.readyForRates
                    ? !data.ratesPersisted && data.warning
                        ? `Saved in Wix, but checkout may miss rates until D1 sync. ${data.warning}`
                        : data.warning
                          ? `Saved (ready for rates). ${data.warning}`
                          : 'Saved. Product is ready for checkout rates (weight + L/W/H).'
                    : data.warning || data.note || 'Saved, but some fields are still missing for rates.'
            );
            if (data.overrideError && !data.readyForRates) {
                setError(data.overrideError);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="tnxl-card">
                <h2 className="text-lg font-semibold text-primary flex items-center gap-2">
                    <Ruler className="w-5 h-5" />
                    Product weight &amp; package size
                </h2>
                <p className="text-sm text-gray-500 mt-2">
                    Search as you type, pick a product, then check{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">readyForRates</code> and save
                    weight and package size to Wix.
                </p>

                <div className="mt-4">
                    <ProductSearchCombobox
                        selected={selected}
                        onSelect={pickProduct}
                        onClear={clearProduct}
                        disabled={loadingPhysical || saving}
                    />
                </div>

                {loadingPhysical && (
                    <p className="mt-3 text-sm text-gray-500 inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading product from Wix…
                    </p>
                )}

                {error && (
                    <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                        {error}
                    </p>
                )}
            </div>

            {physical && selected && !loadingPhysical && (
                <div className="tnxl-card space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-primary">{selected.name}</h3>
                            <p className="text-xs text-gray-400 mt-1">ID: {selected.id}</p>
                        </div>
                        {physical.readyForRates ? (
                            <span className="inline-flex items-center gap-1 text-green-700 text-sm font-medium">
                                <CheckCircle2 className="w-4 h-4" />
                                readyForRates
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-sm font-medium">
                                <XCircle className="w-4 h-4" />
                                Not ready for rates
                            </span>
                        )}
                    </div>

                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <dt className="text-gray-500">Weight (kg)</dt>
                            <dd className="font-medium">
                                {physical.weightKg != null
                                    ? physical.weightKg.toFixed(2)
                                    : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Length (cm)</dt>
                            <dd className="font-medium">{physical.lengthCm ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Width (cm)</dt>
                            <dd className="font-medium">{physical.widthCm ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Height (cm)</dt>
                            <dd className="font-medium">{physical.heightCm ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">HS code</dt>
                            <dd className="font-medium">{physical.hsCode || '—'}</dd>
                        </div>
                    </dl>
                    {physical.fromOverride && (
                        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                            Weight/size includes values saved in Thai Nexus (Wix often does not return
                            shipping weight for products with color options).
                        </p>
                    )}

                    <form onSubmit={saveDims} className="border-t border-gray-100 pt-4 space-y-3">
                        <p className="text-sm font-medium text-gray-700">
                            Save shipping weight and package size
                        </p>
                        <label className="text-sm block max-w-xs">
                            Shipping weight (lb)
                            <input
                                type="number"
                                min={0.01}
                                step={0.01}
                                className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5"
                                value={weightLb}
                                onChange={(ev) => setWeightLb(ev.target.value)}
                                required
                            />
                        </label>
                        <p className="text-sm font-medium text-gray-700">Package dimensions (cm)</p>
                        <div className="grid grid-cols-3 gap-3">
                            <label className="text-sm">
                                Length
                                <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5"
                                    value={lengthCm}
                                    onChange={(ev) => setLengthCm(ev.target.value)}
                                    required
                                />
                            </label>
                            <label className="text-sm">
                                Width
                                <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5"
                                    value={widthCm}
                                    onChange={(ev) => setWidthCm(ev.target.value)}
                                    required
                                />
                            </label>
                            <label className="text-sm">
                                Height
                                <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5"
                                    value={heightCm}
                                    onChange={(ev) => setHeightCm(ev.target.value)}
                                    required
                                />
                            </label>
                        </div>
                        <label className="text-sm block max-w-xs">
                            HS code
                            <input
                                type="text"
                                inputMode="numeric"
                                className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5"
                                value={hsCode}
                                onChange={(ev) => setHsCode(ev.target.value)}
                                placeholder="180690"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-60"
                        >
                            {saving ? 'Saving…' : 'Save to Wix'}
                        </button>
                        {message && (
                            <p
                                className={`text-sm ${physical.warning ? 'text-amber-800' : 'text-green-700'}`}
                            >
                                {message}
                            </p>
                        )}
                        {physical.warning && !message?.includes(physical.warning) && (
                            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
                                {physical.warning}
                            </p>
                        )}
                        <p className="text-xs text-gray-400">{physical.wixEditorHint}</p>
                    </form>
                </div>
            )}
        </div>
    );
}
