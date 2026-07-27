import {
    AlertCircle,
    CheckCircle2,
    Info,
    Loader2,
    Package,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { saveConfig } from '../lib/api';
import { validateShipperForm } from '../lib/validateShipperForm';
import type { ShippingBox, StoreConfigPublic } from '../lib/types';

const newBox = (): ShippingBox => ({
    id: `box_${Date.now()}`,
    name: '',
    innerLengthCm: 0,
    innerWidthCm: 0,
    innerDepthCm: 0,
    maxWeightKg: 0,
    emptyWeightKg: 0,
});

interface BoxesPageProps {
    config: StoreConfigPublic | null;
    onSaved: (saved?: StoreConfigPublic) => void;
}

export default function BoxesPage({ config, onSaved }: BoxesPageProps) {
    const [boxes, setBoxes] = useState<ShippingBox[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
        null
    );
    const [newRowId, setNewRowId] = useState<string | null>(null);

    useEffect(() => {
        if (config?.boxes) {
            setBoxes(config.boxes.length ? config.boxes.map((b) => ({ ...b })) : []);
        }
    }, [config?.updatedAt]);

    const updateBox = (index: number, field: keyof ShippingBox, value: string | number) => {
        setBoxes((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };

            return next;
        });
    };

    const addBox = () => {
        const box = newBox();
        setBoxes((prev) => [...prev, box]);
        setNewRowId(box.id);
    };

    const removeBox = (index: number) => {
        setBoxes((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!config) return;

        const shipperError = validateShipperForm(config.shipper);
        if (shipperError) {
            setMessage({
                type: 'error',
                text: `${shipperError} Complete Settings → Store Origin Address first.`,
            });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const saved = await saveConfig({
                shipper: config.shipper,
                commissionRules: config.commissionRules || [],
                boxes: boxes.filter((b) => b.name.trim() && b.innerLengthCm > 0),
            });
            setMessage({ type: 'success', text: 'Box definitions saved successfully.' });
            onSaved(saved);
            setTimeout(() => setMessage(null), 4000);
        } catch (err) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to save boxes.',
            });
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-gray-500 mt-4 font-medium">Loading box definitions…</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Package className="text-white w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Box inventory</h2>
                            <p className="text-white/80 text-sm">
                                Define the physical boxes you use for shipping.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={addBox}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2 transition-colors text-sm"
                    >
                        <Plus size={18} />
                        Add new box
                    </button>
                </div>

                <div className="p-8">
                    {boxes.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-xl">
                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700">No boxes defined</h3>
                            <p className="text-gray-500 mt-2 mb-6 max-w-md mx-auto">
                                Add your first shipping box to enable 3D box packing at checkout.
                            </p>
                            <button type="button" onClick={addBox} className="tnxl-btn-primary">
                                <Plus size={18} />
                                Add first box
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {boxes.map((box, index) => (
                                <div
                                    key={box.id || index}
                                    className={`border border-gray-100 rounded-xl p-6 hover:border-primary/20 transition-all ${
                                        newRowId === box.id ? 'tnxl-slide-in' : ''
                                    }`}
                                    onAnimationEnd={() => {
                                        if (newRowId === box.id) setNewRowId(null);
                                    }}
                                >
                                    <div className="flex items-start gap-4 mb-6">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                                            {index + 1}
                                        </span>
                                        <input
                                            type="text"
                                            className="tnxl-input flex-1 font-semibold"
                                            placeholder="Box name (e.g. Small mailer)"
                                            value={box.name}
                                            onChange={(e) =>
                                                updateBox(index, 'name', e.target.value)
                                            }
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeBox(index)}
                                            className="text-gray-400 hover:text-secondary p-2 transition-colors"
                                            title="Remove box"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Inner length (cm)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                className="tnxl-input"
                                                value={box.innerLengthCm || ''}
                                                onChange={(e) =>
                                                    updateBox(
                                                        index,
                                                        'innerLengthCm',
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Inner width (cm)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                className="tnxl-input"
                                                value={box.innerWidthCm || ''}
                                                onChange={(e) =>
                                                    updateBox(
                                                        index,
                                                        'innerWidthCm',
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Inner height (cm)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                className="tnxl-input"
                                                value={box.innerDepthCm || ''}
                                                onChange={(e) =>
                                                    updateBox(
                                                        index,
                                                        'innerDepthCm',
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Empty weight (kg)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className="tnxl-input"
                                                value={box.emptyWeightKg || ''}
                                                onChange={(e) =>
                                                    updateBox(
                                                        index,
                                                        'emptyWeightKg',
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Max weight (kg)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className="tnxl-input"
                                                value={box.maxWeightKg || ''}
                                                onChange={(e) =>
                                                    updateBox(
                                                        index,
                                                        'maxWeightKg',
                                                        parseFloat(e.target.value) || 0
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>

                                    <p className="mt-4 text-xs text-gray-400 flex items-center gap-1.5">
                                        <Info size={14} />
                                        Packing uses inner dimensions for fitting items.
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="tnxl-btn-primary py-3 px-10 text-lg shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    {saving ? 'Saving…' : 'Save box inventory'}
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
        </div>
    );
}
