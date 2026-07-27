import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchProducts } from '../lib/api';
import type { ProductSearchResult } from '../lib/types';

const DEBOUNCE_MS = 320;

function formatSearchError(message: string): string {
    if (message.includes('READ_PRODUCTS') || message.includes('Permission')) {
        return `${message} — Add Read/Manage Products in Wix Dev Center, then reinstall the app on your site.`;
    }
    return message;
}

export type ProductSearchComboboxProps = {
    selected: ProductSearchResult | null;
    onSelect: (product: ProductSearchResult) => void;
    onClear: () => void;
    disabled?: boolean;
    placeholder?: string;
};

export default function ProductSearchCombobox({
    selected,
    onSelect,
    onClear,
    disabled = false,
    placeholder = 'Search by product name or SKU…',
}: ProductSearchComboboxProps) {
    const listboxId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<ProductSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchSeq = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const runSearch = useCallback(async (term: string) => {
        const q = term.trim();

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const seq = ++searchSeq.current;

        setSearching(true);
        setSearchError(null);

        try {
            const list = await searchProducts(q, { signal: controller.signal });
            if (seq !== searchSeq.current) return;
            setResults(list);
            setActiveIndex(list.length ? 0 : -1);
            if (!list.length) {
                setSearchError(q ? `No products match "${q}".` : 'No products in catalog.');
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            if (seq !== searchSeq.current) return;
            setResults([]);
            setActiveIndex(-1);
            const msg = err instanceof Error ? err.message : 'Search failed';
            setSearchError(formatSearchError(msg));
        } finally {
            if (seq === searchSeq.current) setSearching(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;

        const timer = window.setTimeout(() => {
            void runSearch(query);
        }, DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [query, open, runSearch]);

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, []);

    useEffect(() => {
        if (!open) setActiveIndex(-1);
    }, [open]);

    const pick = (product: ProductSearchResult) => {
        onSelect(product);
        setQuery('');
        setOpen(false);
        setResults([]);
        setSearchError(null);
        inputRef.current?.blur();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            return;
        }

        if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setOpen(true);
            return;
        }

        if (!open || !results.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = results[activeIndex >= 0 ? activeIndex : 0];
            if (target) pick(target);
        }
    };

    const showPanel = open;

    return (
        <div ref={rootRef} className="space-y-2">
            {selected && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <span className="font-medium text-primary">{selected.name}</span>
                    {selected.sku && (
                        <span className="text-gray-500 text-xs">SKU {selected.sku}</span>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            onClear();
                            setQuery('');
                            setOpen(false);
                            inputRef.current?.focus();
                        }}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-gray-600 hover:bg-white/80"
                        aria-label="Clear selected product"
                    >
                        <X size={14} />
                        Change product
                    </button>
                </div>
            )}

            <div className="relative">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden
                />
                <input
                    ref={inputRef}
                    type="search"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        activeIndex >= 0 && results[activeIndex]
                            ? `${listboxId}-opt-${results[activeIndex].id}`
                            : undefined
                    }
                    disabled={disabled}
                    className="tnxl-input !pl-10 pr-10"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                />
                {searching && (
                    <Loader2
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-secondary"
                        aria-hidden
                    />
                )}
            </div>

            {showPanel && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-md"
                >
                    {searching && results.length === 0 && !searchError && (
                        <p className="px-4 py-3 text-sm text-gray-500">Searching…</p>
                    )}

                    {!searching && searchError && (
                        <p className="px-4 py-3 text-sm text-amber-800 bg-amber-50">{searchError}</p>
                    )}

                    {!searching &&
                        results.map((product, index) => (
                            <button
                                key={product.id}
                                id={`${listboxId}-opt-${product.id}`}
                                type="button"
                                role="option"
                                aria-selected={index === activeIndex}
                                className={`w-full border-b border-gray-50 px-4 py-3 text-left text-sm last:border-0 transition-colors ${
                                    index === activeIndex ? 'bg-primary/10' : 'hover:bg-gray-50'
                                }`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => pick(product)}
                            >
                                <span className="font-medium text-gray-900">{product.name}</span>
                                <span className="mt-0.5 block text-xs text-gray-500">
                                    {product.sku ? <>SKU {product.sku} · </> : null}
                                    ID {product.id}
                                </span>
                            </button>
                        ))}

                    {!searching && !searchError && results.length > 0 && (
                        <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                            ↑↓ to navigate · Enter to select · Esc to close
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
