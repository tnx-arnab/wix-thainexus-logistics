import {
    AlertCircle,
    CheckCircle2,
    DollarSign,
    Info,
    Loader2,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import ProductSearchSelect from '../components/ProductSearchSelect';
import { saveConfig } from '../lib/api';
import type { CommissionRule, StoreConfigPublic } from '../lib/types';

const newRule = (): CommissionRule => ({
    id: `rule_${Date.now()}`,
    conditionType: 'subtotal_range',
    minRange: 0,
    maxRange: 0,
    specificProducts: [],
    feeType: 'fixed',
    feeValue: 0,
    feeLabel: 'Commission Fee',
});

interface FeesPageProps {
    config: StoreConfigPublic | null;
    onSaved: (saved?: StoreConfigPublic) => void;
}

function formatMoney(amount: number, currency: string): string {
    return `${currency}${amount.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

function describeRule(rule: CommissionRule, currency: string): string {
    const label = rule.feeLabel?.trim() || 'Commission fee';
    const value = Number(rule.feeValue) || 0;
    if (value <= 0) {
        return 'Set an amount above 0 for this rule to take effect at checkout.';
    }

    const feeText =
        rule.feeType === 'percentage'
            ? `${value}%`
            : formatMoney(value, currency);

    if (rule.conditionType === 'subtotal_range') {
        const min = Number(rule.minRange) || 0;
        const max = Number(rule.maxRange) || 0;
        const rangeText =
            max > 0
                ? `cart subtotal is between ${formatMoney(min, currency)} and ${formatMoney(max, currency)}`
                : min > 0
                  ? `cart subtotal is ${formatMoney(min, currency)} or more`
                  : 'any cart subtotal';

        if (rule.feeType === 'percentage') {
            return `When ${rangeText}, add ${feeText} of the cart subtotal to each Thai Nexus shipping rate (shown as part of the shipping price).`;
        }

        return `When ${rangeText}, add ${feeText} to each Thai Nexus shipping rate (shown as part of the shipping price).`;
    }

    const productCount = (rule.specificProducts || []).length;
    if (!productCount) {
        return 'Select at least one product for this rule to apply.';
    }

    if (rule.feeType === 'percentage') {
        return `When any of the ${productCount} selected product${productCount === 1 ? '' : 's'} is in the cart, add ${feeText} of those products' line subtotal to each Thai Nexus shipping rate.`;
    }

    return `When any of the ${productCount} selected product${productCount === 1 ? '' : 's'} is in the cart, add a flat ${feeText} to each Thai Nexus shipping rate.`;
}

export default function FeesPage({ config, onSaved }: FeesPageProps) {
    const [rules, setRules] = useState<CommissionRule[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
        null
    );
    const currency = config?.currencySymbol || '฿';

    useEffect(() => {
        if (config?.commissionRules) {
            setRules(
                config.commissionRules.length
                    ? config.commissionRules.map((r) => ({ ...r }))
                    : []
            );
        }
    }, [config?.updatedAt]);

    const updateRule = (index: number, field: keyof CommissionRule, value: unknown) => {
        setRules((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };

            return next;
        });
    };

    const removeRule = (index: number) => {
        setRules((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!config) return;

        setSaving(true);
        setMessage(null);
        try {
            const saved = await saveConfig({
                shipper: config.shipper,
                commissionRules: rules.filter((r) => Number(r.feeValue) > 0),
                boxes: config.boxes || [],
            });
            setMessage({ type: 'success', text: 'Commission rules saved successfully.' });
            onSaved(saved);
            setTimeout(() => setMessage(null), 4000);
        } catch (err) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to save rules.',
            });
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-gray-500 mt-4 font-medium">Loading commission rules…</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <DollarSign className="text-white w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Commission Rules</h2>
                            <p className="text-white/80 text-sm">
                                Add fees on top of Thai Nexus shipping quotes at checkout.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setRules((r) => [...r, newRule()])}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2 transition-colors text-sm"
                    >
                        <Plus size={18} />
                        Add rule
                    </button>
                </div>

                <div className="p-8">
                    <div className="mb-8 flex gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm text-gray-700">
                        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="space-y-2">
                            <p className="font-semibold text-primary">How commission is applied</p>
                            <ul className="list-disc space-y-1 pl-5 text-gray-600">
                                <li>
                                    Fees are added to <strong>every Thai Nexus shipping option</strong>{' '}
                                    shown at checkout - customers see one combined shipping price, not a
                                    separate line item.
                                </li>
                                <li>
                                    <strong>All matching rules are combined.</strong> If two rules apply to
                                    the same order, their amounts are summed.
                                </li>
                                <li>
                                    <strong>Cart subtotal range</strong> - checks the whole cart total
                                    (after discounts, before shipping).
                                </li>
                                <li>
                                    <strong>Specific products</strong> - applies only when at least one
                                    selected product is in the cart. Percentage fees use those products&apos;
                                    line subtotal, not the whole cart.
                                </li>
                                <li>
                                    Rules with amount <strong>0</strong> are ignored and not saved.
                                </li>
                            </ul>
                        </div>
                    </div>

                    {rules.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-xl">
                            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700">
                                No commission rules
                            </h3>
                            <p className="text-gray-500 mt-2 mb-6">
                                You have not set up any dynamic fees yet.
                            </p>
                            <button
                                type="button"
                                onClick={() => setRules([newRule()])}
                                className="tnxl-btn-primary"
                            >
                                <Plus size={18} />
                                Create first rule
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {rules.map((rule, index) => (
                                <div
                                    key={rule.id || index}
                                    className="group border border-gray-100 rounded-xl p-6 hover:border-primary/20 transition-colors"
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-bold text-primary">
                                            Rule #{index + 1}
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => removeRule(index)}
                                            className="text-secondary hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                                            title="Remove rule"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                                                Condition
                                            </h4>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                    Apply based on
                                                </label>
                                                <select
                                                    className="tnxl-input bg-white"
                                                    value={rule.conditionType}
                                                    onChange={(e) =>
                                                        updateRule(
                                                            index,
                                                            'conditionType',
                                                            e.target.value
                                                        )
                                                    }
                                                >
                                                    <option value="subtotal_range">
                                                        Cart subtotal range
                                                    </option>
                                                    <option value="specific_products">
                                                        Specific products in cart
                                                    </option>
                                                </select>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    {rule.conditionType === 'subtotal_range'
                                                        ? 'Triggers when the cart subtotal falls within your min/max range.'
                                                        : 'Triggers when at least one selected product is in the cart.'}
                                                </p>
                                            </div>

                                            {rule.conditionType === 'subtotal_range' && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                            Min subtotal
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                                                {currency}
                                                            </span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                className="tnxl-input pl-8"
                                                                value={rule.minRange ?? 0}
                                                                onChange={(e) =>
                                                                    updateRule(
                                                                        index,
                                                                        'minRange',
                                                                        parseFloat(e.target.value) || 0
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                            Max subtotal
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                                                {currency}
                                                            </span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                className="tnxl-input pl-8"
                                                                placeholder="0 = no limit"
                                                                value={rule.maxRange ?? 0}
                                                                onChange={(e) =>
                                                                    updateRule(
                                                                        index,
                                                                        'maxRange',
                                                                        parseFloat(e.target.value) || 0
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            Set to 0 for unlimited. Subtotal is the cart
                                                            total before shipping.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {rule.conditionType === 'specific_products' && (
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                        Select products
                                                    </label>
                                                    <ProductSearchSelect
                                                        selectedProducts={
                                                            rule.specificProducts || []
                                                        }
                                                        onChange={(products) =>
                                                            updateRule(
                                                                index,
                                                                'specificProducts',
                                                                products
                                                            )
                                                        }
                                                    />
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Search and add products. Names load automatically
                                                        for saved rules.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                                                Fee calculation
                                            </h4>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                    Rule name
                                                </label>
                                                <input
                                                    type="text"
                                                    className="tnxl-input"
                                                    placeholder="e.g. Handling fee"
                                                    value={rule.feeLabel || ''}
                                                    onChange={(e) =>
                                                        updateRule(index, 'feeLabel', e.target.value)
                                                    }
                                                    required
                                                />
                                                <p className="text-xs text-gray-500 mt-2">
                                                    For your reference only - the fee is included in the
                                                    shipping price, not shown as a separate checkout line.
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                        Fee type
                                                    </label>
                                                    <select
                                                        className="tnxl-input bg-white"
                                                        value={rule.feeType}
                                                        onChange={(e) =>
                                                            updateRule(
                                                                index,
                                                                'feeType',
                                                                e.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="fixed">Fixed price</option>
                                                        <option value="percentage">
                                                            Percentage (%)
                                                        </option>
                                                    </select>
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        {rule.feeType === 'fixed'
                                                            ? 'A flat amount added to each Thai Nexus rate.'
                                                            : 'Calculated from the cart subtotal (range rules) or matching products (product rules).'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                        Amount
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                                            {rule.feeType === 'fixed'
                                                                ? currency
                                                                : '%'}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="0.01"
                                                            className="tnxl-input pl-8"
                                                            value={rule.feeValue}
                                                            onChange={(e) =>
                                                                updateRule(
                                                                    index,
                                                                    'feeValue',
                                                                    parseFloat(e.target.value) || 0
                                                                )
                                                            }
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                                        <span className="font-semibold text-gray-700">Preview: </span>
                                        {describeRule(rule, currency)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
                <button
                    type="submit"
                    disabled={saving}
                    className="tnxl-btn-primary py-3 px-10 text-lg shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    {saving ? 'Saving…' : 'Save rules'}
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
