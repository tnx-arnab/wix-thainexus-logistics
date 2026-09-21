import {
    AlertCircle,
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    DollarSign,
    Info,
    Loader2,
    Pencil,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import AdvancedRuleWizard from '../components/fees/AdvancedRuleWizard';
import PricingFormulaEditor from '../components/fees/PricingFormulaEditor';
import PricingModeToggle from '../components/fees/PricingModeToggle';
import { saveConfig } from '../lib/api';
import {
    BASIC_RULE_ID,
    combineAlwaysOnFormula,
    describeExample,
    describeFormula,
    describeRule,
    describeWhen,
    emptyRule,
    firstAlwaysOn,
    formulaFrom,
    inferPricingMode,
    isAlwaysOn,
    mergeBasicFormula,
    pickupUnitLabel,
    ruleHasEffect,
    withFormulaValue,
    type FormulaValue,
} from '../lib/pricingFormula';
import type { CommissionRule, PricingMode, StoreConfigPublic } from '../lib/types';

interface FeesPageProps {
    config: StoreConfigPublic | null;
    onSaved: (saved?: StoreConfigPublic) => void;
}

export default function FeesPage({ config, onSaved }: FeesPageProps) {
    const [rules, setRules] = useState<CommissionRule[]>([]);
    const [mode, setMode] = useState<PricingMode>('basic');
    const [basicLabel, setBasicLabel] = useState('Commission Fee');
    const [cartOpen, setCartOpen] = useState(false);
    const [wizard, setWizard] = useState<{ index: number | null; rule?: CommissionRule } | null>(
        null
    );
    const [composing, setComposing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
        null
    );
    const currency = config?.currencySymbol || '฿';

    useEffect(() => {
        if (!config) return;

        const nextRules = (config.commissionRules || []).map((r) => ({ ...r }));
        setRules(nextRules);
        setMode(inferPricingMode(nextRules, config.pricingMode));
        const always = firstAlwaysOn(nextRules);
        setBasicLabel(always?.feeLabel || 'Commission Fee');
        setCartOpen((always ? formulaFrom(always).cartPercent : 0) > 0);
        setWizard(null);
        setComposing(false);
    }, [config?.updatedAt]);

    const basicRule = useMemo(
        () => firstAlwaysOn(rules) || emptyRule(BASIC_RULE_ID),
        [rules]
    );
    const basicFormula = useMemo(
        () =>
            rules.filter(isAlwaysOn).length > 1
                ? combineAlwaysOnFormula(rules)
                : formulaFrom(basicRule),
        [rules, basicRule]
    );
    const basicExample = describeExample(
        withFormulaValue(basicRule, basicFormula),
        currency
    );

    const patchBasic = (formula: FormulaValue) => {
        setRules((prev) => {
            const existing = prev.find(isAlwaysOn) || emptyRule(BASIC_RULE_ID);
            const next = withFormulaValue(existing, formula);

            return [next, ...prev.filter((r) => !isAlwaysOn(r))];
        });
    };

    const saveWizardRule = (rule: CommissionRule) => {
        setRules((prev) => {
            if (wizard?.index == null) return [...prev, rule];

            const next = [...prev];
            next[wizard.index] = rule;

            return next;
        });
        setWizard(null);
    };

    const removeRule = (index: number) => {
        setRules((prev) => prev.filter((_, i) => i !== index));
    };

    const moveRule = (index: number, dir: -1 | 1) => {
        setRules((prev) => {
            const target = index + dir;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);

            return next;
        });
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!config || wizard) return;

        setSaving(true);
        setMessage(null);
        try {
            const commissionRules =
                mode === 'basic'
                    ? mergeBasicFormula(rules, basicFormula, basicLabel)
                    : rules.filter(ruleHasEffect);
            const saved = await saveConfig({
                shipper: config.shipper,
                commissionRules,
                boxes: config.boxes || [],
                pricingMode: mode,
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

    const hasRules = rules.some(ruleHasEffect) || rules.some((rule) => !isAlwaysOn(rule));
    const showEmpty = !hasRules && !composing && !wizard;
    const startFirstRule = () => {
        if (mode === 'advanced') {
            setWizard({ index: null });
            return;
        }
        setComposing(true);
    };

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-primary p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <DollarSign className="text-white w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Commission Rules</h2>
                            <p className="text-white/80 text-sm">
                                {mode === 'basic'
                                    ? 'One formula for every cart. Switch to Advanced for conditions.'
                                    : 'Build rules with conditions. Matching rules combine in list order.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <PricingModeToggle
                            value={mode}
                            onChange={(next) => {
                                setMode(next);
                                setWizard(null);
                            }}
                        />
                        {mode === 'advanced' && !wizard && !showEmpty && (
                            <button
                                type="button"
                                onClick={() => setWizard({ index: null })}
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2 transition-colors text-sm"
                            >
                                <Plus size={18} />
                                Add rule
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-8">
                    {showEmpty ? (
                        <div className="flex flex-col items-center text-center py-16 border-2 border-dashed border-gray-100 rounded-xl">
                            <DollarSign className="w-12 h-12 text-gray-300 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700">
                                No commission rules
                            </h3>
                            <p className="text-gray-500 mt-2 mb-6 max-w-md">
                                Checkout uses the Thai Nexus quote only. Add a fee to apply pickup,
                                markup, or cart % at checkout.
                            </p>
                            <button
                                type="button"
                                onClick={startFirstRule}
                                className="tnxl-btn-primary"
                            >
                                <Plus size={18} />
                                Create first rule
                            </button>
                        </div>
                    ) : (
                        <>
                    <div className="mb-8 flex gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm text-gray-700">
                        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="space-y-2">
                            <p className="font-semibold text-primary">How commission is applied</p>
                            <ul className="list-disc space-y-1 pl-5 text-gray-600">
                                <li>
                                    Shipping price = (Thai Nexus quote + pickup) x markup. Optional
                                    cart % is added after that.
                                </li>
                                <li>
                                    Fees are included in every Thai Nexus shipping option. Customers
                                    see one combined shipping price.
                                </li>
                                {mode === 'basic' ? (
                                    <li>
                                        Basic applies this formula to every cart. Advanced rules
                                        stay saved and apply again when you switch to Advanced.
                                    </li>
                                ) : (
                                    <li>
                                        All matching rules combine unless a rule is set to stop
                                        later rules. List order is the evaluation order.
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>

                    {mode === 'basic' ? (
                        <div className="space-y-4 max-w-3xl">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Rule name
                                </label>
                                <input
                                    type="text"
                                    className="tnxl-input"
                                    placeholder="e.g. Pickup + markup"
                                    value={basicLabel}
                                    onChange={(e) => setBasicLabel(e.target.value)}
                                    required
                                />
                            </div>
                            <PricingFormulaEditor
                                value={basicFormula}
                                onChange={patchBasic}
                                currency={currency}
                                draftKey={`${basicRule.id}-${config?.updatedAt || 0}`}
                                example={basicExample}
                                showCart={cartOpen || basicFormula.cartPercent > 0}
                                onToggleCart={() => setCartOpen(true)}
                            />
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                                <span className="font-semibold text-gray-700">Preview: </span>
                                {describeRule(
                                    withFormulaValue(
                                        { ...basicRule, feeLabel: basicLabel },
                                        basicFormula
                                    ),
                                    currency
                                )}
                            </div>
                            {rules.some((r) => !isAlwaysOn(r)) && (
                                <p className="text-xs text-gray-500">
                                    {rules.filter((r) => !isAlwaysOn(r)).length} advanced rule
                                    {rules.filter((r) => !isAlwaysOn(r)).length === 1 ? '' : 's'}{' '}
                                    saved and paused until you switch to Advanced.
                                </p>
                            )}
                        </div>
                    ) : wizard ? (
                        <AdvancedRuleWizard
                            initial={wizard.rule}
                            currency={currency}
                            onCancel={() => setWizard(null)}
                            onSave={saveWizardRule}
                        />
                    ) : (
                        <div className="space-y-3">
                            {rules.map((rule, index) => (
                                <div
                                    key={rule.id || index}
                                    className="group border border-gray-100 rounded-xl p-4 hover:border-primary/20 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-bold text-primary">
                                                    {rule.feeLabel || `Rule #${index + 1}`}
                                                </h3>
                                                {rule.stopProcessing && (
                                                    <span className="rounded-full bg-secondary/10 text-secondary text-xs font-semibold px-2 py-0.5">
                                                        Stops later rules
                                                    </span>
                                                )}
                                                {rule.pickupUnit && rule.pickupUnit !== 'once' && (
                                                    <span className="rounded-full bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5">
                                                        Pickup {pickupUnitLabel(rule.pickupUnit)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">
                                                When {describeWhen(rule, currency)}
                                            </p>
                                            <p className="text-sm text-gray-700 mt-1">
                                                {describeFormula(rule, currency)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => moveRule(index, -1)}
                                                disabled={index === 0}
                                                className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30"
                                                title="Move up"
                                            >
                                                <ArrowUp size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveRule(index, 1)}
                                                disabled={index === rules.length - 1}
                                                className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30"
                                                title="Move down"
                                            >
                                                <ArrowDown size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setWizard({ index, rule: { ...rule } })
                                                }
                                                className="p-2 rounded-lg text-primary hover:bg-primary/5"
                                                title="Edit rule"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeRule(index)}
                                                className="p-2 rounded-lg text-secondary hover:bg-red-50"
                                                title="Remove rule"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                        </>
                    )}
                </div>
            </div>

            {showEmpty ? null : (
            <div className="flex flex-wrap items-center gap-6">
                <button
                    type="submit"
                    disabled={saving || Boolean(wizard)}
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
            )}
        </form>
    );
}
