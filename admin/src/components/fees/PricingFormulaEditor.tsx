import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    formatMarkupMultiplier,
    markupPercentFromMultiplier,
    type FormulaValue,
} from '../../lib/pricingFormula';
import type { PickupUnit } from '../../lib/types';

interface PricingFormulaEditorProps {
    value: FormulaValue;
    onChange: (value: FormulaValue) => void;
    currency: string;
    draftKey: string;
    example?: string | null;
    showCart?: boolean;
    onToggleCart?: () => void;
    showPickupUnit?: boolean;
    pickupUnit?: PickupUnit;
    onPickupUnitChange?: (unit: PickupUnit) => void;
}

export default function PricingFormulaEditor({
    value,
    onChange,
    currency,
    draftKey,
    example,
    showCart,
    onToggleCart,
    showPickupUnit,
    pickupUnit = 'once',
    onPickupUnitChange,
}: PricingFormulaEditorProps) {
    const [pickupDraft, setPickupDraft] = useState<string | undefined>();
    const [markupDraft, setMarkupDraft] = useState<string | undefined>();
    const [cartDraft, setCartDraft] = useState<string | undefined>();

    useEffect(() => {
        setPickupDraft(undefined);
        setMarkupDraft(undefined);
        setCartDraft(undefined);
    }, [draftKey]);

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                    Shipping price
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-sm font-medium text-gray-700">
                    <span className="text-gray-400 text-lg">(</span>
                    <span className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-gray-500">
                        Base quotation
                    </span>
                    <span className="text-gray-400">+</span>
                    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary">
                        <span className="pl-3 pr-1.5 text-gray-400 text-sm shrink-0">
                            {currency}
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            className="tnxl-input !w-24 !border-0 !px-2 !ring-0 bg-transparent"
                            placeholder=""
                            value={
                                pickupDraft !== undefined
                                    ? pickupDraft
                                    : value.pickup > 0
                                      ? String(value.pickup)
                                      : ''
                            }
                            onChange={(e) => {
                                const raw = e.target.value;
                                setPickupDraft(raw);
                                onChange({
                                    pickup: parseFloat(raw) || 0,
                                    markupPercent:
                                        markupDraft !== undefined
                                            ? markupPercentFromMultiplier(markupDraft)
                                            : value.markupPercent,
                                    cartPercent:
                                        cartDraft !== undefined
                                            ? parseFloat(cartDraft) || 0
                                            : value.cartPercent,
                                });
                            }}
                            onBlur={() => setPickupDraft(undefined)}
                            aria-label="Pickup amount"
                        />
                    </div>
                    <span className="text-xs text-gray-500">pickup</span>
                    <span className="text-gray-400 text-lg">)</span>
                    <span className="text-gray-400 text-lg">x</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        className="tnxl-input !w-24 bg-white"
                        placeholder="1.15"
                        value={
                            markupDraft !== undefined
                                ? markupDraft
                                : formatMarkupMultiplier(value.markupPercent)
                        }
                        onChange={(e) => {
                            const raw = e.target.value;
                            setMarkupDraft(raw);
                            onChange({
                                pickup:
                                    pickupDraft !== undefined
                                        ? parseFloat(pickupDraft) || 0
                                        : value.pickup,
                                markupPercent: markupPercentFromMultiplier(raw),
                                cartPercent:
                                    cartDraft !== undefined
                                        ? parseFloat(cartDraft) || 0
                                        : value.cartPercent,
                            });
                        }}
                        onBlur={() => setMarkupDraft(undefined)}
                        aria-label="Markup multiplier"
                    />
                    <span className="text-xs text-gray-500">markup</span>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                    Pickup can be empty to skip it. Markup 1 means no extra. 1.15 means 15% on
                    (quote + pickup).
                </p>
                {example && (
                    <p className="mt-3 text-sm text-gray-700" dir="ltr">
                        {example}
                    </p>
                )}
            </div>

            {showPickupUnit && onPickupUnitChange && (
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Pickup applies
                    </label>
                    <div className="flex flex-wrap gap-3 text-sm">
                        {(
                            [
                                ['once', 'Once per shipment'],
                                ['per_item', 'Per item'],
                                ['per_kg', 'Per kg'],
                            ] as Array<[PickupUnit, string]>
                        ).map(([unit, label]) => (
                            <label key={unit} className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`${draftKey}-pickup-unit`}
                                    checked={pickupUnit === unit}
                                    onChange={() => onPickupUnitChange(unit)}
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {showCart || value.cartPercent > 0 ? (
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Also add % of cart after markup
                    </label>
                    <div className="inline-flex w-full items-center rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary">
                        <span className="pl-3 pr-1.5 text-gray-400 text-sm shrink-0">
                            %
                        </span>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="tnxl-input !border-0 !px-2 !ring-0 bg-transparent"
                            placeholder="0"
                            value={
                                cartDraft !== undefined
                                    ? cartDraft
                                    : value.cartPercent > 0
                                      ? value.cartPercent
                                      : ''
                            }
                            onChange={(e) => {
                                const raw = e.target.value;
                                setCartDraft(raw);
                                onChange({
                                    pickup:
                                        pickupDraft !== undefined
                                            ? parseFloat(pickupDraft) || 0
                                            : value.pickup,
                                    markupPercent:
                                        markupDraft !== undefined
                                            ? markupPercentFromMultiplier(markupDraft)
                                            : value.markupPercent,
                                    cartPercent: parseFloat(raw) || 0,
                                });
                            }}
                            onBlur={() => setCartDraft(undefined)}
                            aria-label="Cart percent"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Added after (quote + pickup) x markup. Uses the cart subtotal, or matching
                        products for product rules.
                    </p>
                </div>
            ) : (
                onToggleCart && (
                    <button
                        type="button"
                        onClick={onToggleCart}
                        className="text-sm font-medium text-primary inline-flex items-center gap-1 hover:underline"
                    >
                        <ChevronDown size={16} />
                        Also add % of cart after markup
                    </button>
                )
            )}
        </div>
    );
}
