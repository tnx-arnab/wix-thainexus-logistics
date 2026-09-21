import { ArrowLeft, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    conditionIncomplete,
    describeExample,
    describeRule,
    effectiveConditions,
    emptyRule,
    formulaFrom,
    ruleHasEffect,
    withFormulaValue,
    type FormulaValue,
} from '../../lib/pricingFormula';
import type { CommissionRule, PickupUnit } from '../../lib/types';
import ConditionPicker from './ConditionPicker';
import PricingFormulaEditor from './PricingFormulaEditor';

const STEPS = ['When', 'Price', 'Review'] as const;

interface AdvancedRuleWizardProps {
    initial?: CommissionRule;
    currency: string;
    onCancel: () => void;
    onSave: (rule: CommissionRule) => void;
}

export default function AdvancedRuleWizard({
    initial,
    currency,
    onCancel,
    onSave,
}: AdvancedRuleWizardProps) {
    const [step, setStep] = useState(0);
    const [rule, setRule] = useState<CommissionRule>(() => {
        if (!initial) return emptyRule();

        const conditions =
            Array.isArray(initial.conditions) && initial.conditions.length
                ? [...initial.conditions]
                : effectiveConditions(initial);

        return { ...initial, conditions };
    });
    const [cartOpen, setCartOpen] = useState((initial ? formulaFrom(initial).cartPercent : 0) > 0);
    const [error, setError] = useState<string | null>(null);

    const formula = useMemo(() => formulaFrom(rule), [rule]);
    const example = describeExample(rule, currency);

    const setFormula = (next: FormulaValue) => {
        setRule((prev) => withFormulaValue(prev, next));
    };

    const pickupUnit: PickupUnit = rule.pickupUnit || 'once';

    const goNext = () => {
        setError(null);
        if (step === 0) {
            for (const condition of rule.conditions || []) {
                const message = conditionIncomplete(condition);
                if (message) {
                    setError(message);
                    return;
                }
            }
        }

        if (step === 1 && !ruleHasEffect(rule)) {
            setError('Set pickup, markup, or cart % above 0.');
            return;
        }

        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const finish = () => {
        if (!ruleHasEffect(rule)) {
            setError('Set pickup, markup, or cart % above 0.');
            return;
        }

        const next = { ...rule };
        if (!(rule.conditions || []).length) {
            next.conditions = [];
            next.conditionType = 'subtotal_range';
            next.minRange = 0;
            next.maxRange = 0;
            next.specificProducts = [];
        }

        onSave(next);
    };

    return (
        <div
            className="rounded-xl border border-primary/20 bg-white p-6 space-y-6"
            onKeyDown={(e) => {
                if (
                    e.key === 'Enter' &&
                    ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
                ) {
                    e.preventDefault();
                }
            }}
        >
            <div className="flex items-center justify-between gap-4">
                <h3 className="font-bold text-primary">
                    {initial ? 'Edit rule' : 'New rule'}
                </h3>
                <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {STEPS.map((label, i) => (
                        <li
                            key={label}
                            className={i === step ? 'text-primary' : i < step ? 'text-gray-600' : ''}
                        >
                            {i + 1}. {label}
                        </li>
                    ))}
                </ol>
            </div>

            {step === 0 && (
                <ConditionPicker
                    conditions={rule.conditions || []}
                    onChange={(conditions) => setRule((prev) => ({ ...prev, conditions }))}
                    currency={currency}
                />
            )}

            {step === 1 && (
                <PricingFormulaEditor
                    value={formula}
                    onChange={setFormula}
                    currency={currency}
                    draftKey={rule.id}
                    example={example}
                    showCart={cartOpen || formula.cartPercent > 0}
                    onToggleCart={() => setCartOpen(true)}
                    showPickupUnit
                    pickupUnit={pickupUnit}
                    onPickupUnitChange={(unit) =>
                        setRule((prev) => {
                            const next = { ...prev };
                            if (unit === 'once') delete next.pickupUnit;
                            else next.pickupUnit = unit;

                            return next;
                        })
                    }
                />
            )}

            {step === 2 && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Rule name
                        </label>
                        <input
                            type="text"
                            className="tnxl-input"
                            placeholder="e.g. Japan pickup"
                            value={rule.feeLabel || ''}
                            onChange={(e) =>
                                setRule((prev) => ({ ...prev, feeLabel: e.target.value }))
                            }
                            required
                        />
                    </div>
                    <label className="inline-flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={Boolean(rule.stopProcessing)}
                            onChange={(e) =>
                                setRule((prev) => {
                                    const next = { ...prev };
                                    if (e.target.checked) next.stopProcessing = true;
                                    else delete next.stopProcessing;

                                    return next;
                                })
                            }
                        />
                        <span>
                            Stop after this rule if it matches. Later rules in the list are skipped.
                        </span>
                    </label>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        <span className="font-semibold text-gray-700">Preview: </span>
                        {describeRule(rule, currency)}
                    </div>
                </div>
            )}

            {error && <p className="text-sm text-secondary">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
                {step > 0 ? (
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setStep((s) => s - 1);
                        }}
                        className="tnxl-btn-secondary"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                ) : (
                    <button type="button" onClick={onCancel} className="tnxl-btn-secondary">
                        Cancel
                    </button>
                )}
                {step < STEPS.length - 1 ? (
                    <button type="button" onClick={goNext} className="tnxl-btn-primary">
                        Next
                    </button>
                ) : (
                    <button type="button" onClick={finish} className="tnxl-btn-primary">
                        <Check size={16} />
                        Save rule
                    </button>
                )}
            </div>
        </div>
    );
}
