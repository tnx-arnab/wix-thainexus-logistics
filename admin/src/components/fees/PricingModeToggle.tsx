import type { PricingMode } from '../../lib/types';

interface PricingModeToggleProps {
    value: PricingMode;
    onChange: (mode: PricingMode) => void;
}

export default function PricingModeToggle({ value, onChange }: PricingModeToggleProps) {
    return (
        <div className="inline-flex rounded-lg bg-white/10 p-1 text-sm font-medium">
            <button
                type="button"
                onClick={() => onChange('basic')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                    value === 'basic' ? 'bg-white text-secondary' : 'text-white/80 hover:text-white'
                }`}
            >
                Basic
            </button>
            <button
                type="button"
                onClick={() => onChange('advanced')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                    value === 'advanced'
                        ? 'bg-white text-secondary'
                        : 'text-white/80 hover:text-white'
                }`}
            >
                Advanced
            </button>
        </div>
    );
}
