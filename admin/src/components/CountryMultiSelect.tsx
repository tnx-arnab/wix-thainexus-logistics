import { useMemo, useState } from 'react';
import { COUNTRIES, countryName } from '../lib/countries';

interface CountryMultiSelectProps {
    selected: string[];
    onChange: (codes: string[]) => void;
    placeholder?: string;
}

export default function CountryMultiSelect({
    selected,
    onChange,
    placeholder = 'Search countries to add',
}: CountryMultiSelectProps) {
    const [query, setQuery] = useState('');
    const selectedSet = useMemo(() => new Set(selected.map((c) => c.toUpperCase())), [selected]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? COUNTRIES.filter(
                  (c) =>
                      c.name.toLowerCase().includes(q) ||
                      c.code.toLowerCase().includes(q)
              )
            : COUNTRIES;

        return list.slice(0, 12);
    }, [query]);

    const add = (code: string) => {
        const iso = code.toUpperCase();
        if (selectedSet.has(iso)) return;
        onChange([...selected, iso]);
        setQuery('');
    };

    const remove = (code: string) => {
        onChange(selected.filter((c) => c.toUpperCase() !== code.toUpperCase()));
    };

    return (
        <div className="space-y-2">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((code) => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => remove(code)}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        >
                            {countryName(code)} ({code})
                            <span aria-hidden className="text-primary/70">
                                x
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <input
                type="search"
                className="tnxl-input text-sm"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const match = filtered.find((c) => !selectedSet.has(c.code));
                    if (match) add(match.code);
                }}
            />
            {(query.trim() || selected.length === 0) && (
                <ul className="max-h-40 overflow-auto rounded-lg border border-gray-100 bg-white text-sm">
                    {filtered.length === 0 ? (
                        <li className="px-3 py-2 text-gray-400">No matches</li>
                    ) : (
                        filtered.map((c) => {
                            const added = selectedSet.has(c.code);

                            return (
                                <li key={c.code}>
                                    <button
                                        type="button"
                                        disabled={added}
                                        onClick={() => add(c.code)}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 disabled:text-gray-400"
                                    >
                                        <span>
                                            {c.name} ({c.code})
                                        </span>
                                        {added && <span className="text-xs">Added</span>}
                                    </button>
                                </li>
                            );
                        })
                    )}
                </ul>
            )}
        </div>
    );
}
