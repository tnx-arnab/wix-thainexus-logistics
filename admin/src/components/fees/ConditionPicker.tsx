import { InputHTMLAttributes, useEffect, useId, useState } from 'react';
import CountryMultiSelect from '../CountryMultiSelect';
import ProductSearchSelect from '../ProductSearchSelect';
import { fetchShippingServices } from '../../lib/api';
import { CONDITION_OPTIONS } from '../../lib/pricingFormula';
import type {
    CommissionCondition,
    CommissionConditionKind,
    ThaiNexusShippingService,
} from '../../lib/types';

interface ConditionPickerProps {
    conditions: CommissionCondition[];
    onChange: (conditions: CommissionCondition[]) => void;
    currency: string;
}

function normalizeServiceId(value: string): string {
    return value.trim().replace(/\s+/g, '_').toLowerCase();
}

function serviceKeys(service: { id: string; service_name: string }): string[] {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const raw of [service.id, service.service_name]) {
        const id = normalizeServiceId(String(raw || ''));
        if (!id || seen.has(id)) continue;
        seen.add(id);
        keys.push(id);
    }

    return keys;
}

function emptyCondition(type: CommissionConditionKind): CommissionCondition {
    if (type === 'subtotal_range') return { type, minRange: 0, maxRange: 0 };
    if (type === 'specific_products') return { type, specificProducts: [] };
    if (type === 'destination_country') return { type, countries: [], excludeCountries: false };
    if (type === 'weight_range') return { type, minKg: 0, maxKg: 0 };
    if (type === 'item_quantity') return { type, minQuantity: 0, maxQuantity: 0 };

    return { type: 'shipping_service', serviceIds: [] };
}

function parseDraftNumber(raw: string, integer?: boolean): number {
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;

    return integer ? Math.round(n) : n;
}

function DraftNumberInput({
    value,
    onChange,
    integer,
    className,
    ...props
}: {
    value: number;
    onChange: (n: number) => void;
    integer?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
    const [draft, setDraft] = useState<string>();

    return (
        <input
            type="number"
            min={0}
            step={integer ? 1 : '0.01'}
            className={className || 'tnxl-input'}
            value={draft !== undefined ? draft : value > 0 ? value : ''}
            onChange={(e) => {
                const raw = e.target.value;
                setDraft(raw);
                onChange(parseDraftNumber(raw, integer));
            }}
            onBlur={() => setDraft(undefined)}
            {...props}
        />
    );
}

export default function ConditionPicker({
    conditions,
    onChange,
    currency,
}: ConditionPickerProps) {
    const destModeName = useId();
    const [services, setServices] = useState<ThaiNexusShippingService[]>([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [servicesError, setServicesError] = useState<string | null>(null);
    const selected = new Set(conditions.map((c) => c.type));

    useEffect(() => {
        let cancelled = false;
        setServicesLoading(true);
        fetchShippingServices()
            .then((list) => {
                if (cancelled) return;
                setServices(list);
                setServicesError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                setServices([]);
                setServicesError(err instanceof Error ? err.message : 'Failed to load services');
            })
            .finally(() => {
                if (!cancelled) setServicesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const toggle = (type: CommissionConditionKind) => {
        if (selected.has(type)) {
            onChange(conditions.filter((c) => c.type !== type));
            return;
        }

        onChange([...conditions, emptyCondition(type)]);
    };

    const patch = (type: CommissionConditionKind, next: Partial<CommissionCondition>) => {
        onChange(conditions.map((c) => (c.type === type ? { ...c, ...next, type } : c)));
    };

    const get = (type: CommissionConditionKind) => conditions.find((c) => c.type === type);

    const selectedServiceIds = get('shipping_service')?.serviceIds || [];

    return (
        <div className="space-y-5">
            <p className="text-sm text-gray-600">
                Pick one or more conditions. All selected conditions must match (AND). None
                selected means this rule always applies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CONDITION_OPTIONS.map((option) => {
                    const on = selected.has(option.type);

                    return (
                        <button
                            key={option.type}
                            type="button"
                            onClick={() => toggle(option.type)}
                            className={`rounded-xl border p-4 text-left transition-colors ${
                                on
                                    ? 'border-primary bg-primary/5'
                                    : 'border-gray-200 hover:border-primary/30'
                            }`}
                        >
                            <p className="font-semibold text-gray-800">{option.label}</p>
                            <p className="text-xs text-gray-500 mt-1">{option.hint}</p>
                        </button>
                    );
                })}
            </div>

            {get('subtotal_range') && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Min subtotal
                        </label>
                        <div className="inline-flex w-full items-center rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary">
                            <span className="pl-3 pr-1.5 text-gray-400 text-sm shrink-0">
                                {currency}
                            </span>
                            <DraftNumberInput
                                className="tnxl-input !border-0 !px-2 !ring-0 bg-transparent"
                                value={get('subtotal_range')?.minRange ?? 0}
                                onChange={(minRange) => patch('subtotal_range', { minRange })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Max subtotal
                        </label>
                        <div className="inline-flex w-full items-center rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary">
                            <span className="pl-3 pr-1.5 text-gray-400 text-sm shrink-0">
                                {currency}
                            </span>
                            <DraftNumberInput
                                className="tnxl-input !border-0 !px-2 !ring-0 bg-transparent"
                                placeholder="0 = no limit"
                                value={get('subtotal_range')?.maxRange ?? 0}
                                onChange={(maxRange) => patch('subtotal_range', { maxRange })}
                            />
                        </div>
                    </div>
                </div>
            )}

            {get('specific_products') && (
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Select products
                    </label>
                    <ProductSearchSelect
                        selectedProducts={get('specific_products')?.specificProducts || []}
                        onChange={(products) =>
                            patch('specific_products', { specificProducts: products })
                        }
                    />
                </div>
            )}

            {get('destination_country') && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name={destModeName}
                                checked={!get('destination_country')?.excludeCountries}
                                onChange={() =>
                                    patch('destination_country', { excludeCountries: false })
                                }
                            />
                            Include countries
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name={destModeName}
                                checked={Boolean(get('destination_country')?.excludeCountries)}
                                onChange={() =>
                                    patch('destination_country', { excludeCountries: true })
                                }
                            />
                            Exclude countries
                        </label>
                    </div>
                    <CountryMultiSelect
                        selected={get('destination_country')?.countries || []}
                        onChange={(countries) => patch('destination_country', { countries })}
                    />
                </div>
            )}

            {get('weight_range') && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Min weight (kg)
                        </label>
                        <DraftNumberInput
                            value={get('weight_range')?.minKg ?? 0}
                            onChange={(minKg) => patch('weight_range', { minKg })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Max weight (kg)
                        </label>
                        <DraftNumberInput
                            placeholder="0 = no limit"
                            value={get('weight_range')?.maxKg ?? 0}
                            onChange={(maxKg) => patch('weight_range', { maxKg })}
                        />
                    </div>
                </div>
            )}

            {get('item_quantity') && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Min quantity
                        </label>
                        <DraftNumberInput
                            integer
                            value={get('item_quantity')?.minQuantity ?? 0}
                            onChange={(minQuantity) => patch('item_quantity', { minQuantity })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Max quantity
                        </label>
                        <DraftNumberInput
                            integer
                            placeholder="0 = no limit"
                            value={get('item_quantity')?.maxQuantity ?? 0}
                            onChange={(maxQuantity) => patch('item_quantity', { maxQuantity })}
                        />
                    </div>
                </div>
            )}

            {get('shipping_service') && (
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Shipping services
                    </label>
                    {servicesLoading ? (
                        <p className="text-sm text-gray-500">Loading services…</p>
                    ) : servicesError ? (
                        <p className="text-sm text-gray-500">
                            {servicesError}. Save your API token in Settings, then return here.
                        </p>
                    ) : services.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No services loaded. Save your API token in Settings, then return here.
                        </p>
                    ) : (
                        <ul className="rounded-xl border border-gray-200 divide-y max-h-56 overflow-auto">
                            {services.map((service) => {
                                const keys = serviceKeys(service);
                                const checked = keys.some((id) => selectedServiceIds.includes(id));

                                return (
                                    <li key={keys[0] || service.id}>
                                        <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    patch('shipping_service', {
                                                        serviceIds: checked
                                                            ? selectedServiceIds.filter(
                                                                  (s) => !keys.includes(s)
                                                              )
                                                            : [
                                                                  ...selectedServiceIds,
                                                                  ...keys.filter(
                                                                      (id) =>
                                                                          !selectedServiceIds.includes(
                                                                              id
                                                                          )
                                                                  ),
                                                              ],
                                                    });
                                                }}
                                            />
                                            {service.service_name || service.id}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
