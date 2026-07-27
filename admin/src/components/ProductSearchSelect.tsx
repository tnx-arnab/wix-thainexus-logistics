import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchProductsByIds, searchProducts } from '../lib/api';
import type { ProductSearchResult } from '../lib/types';

interface ProductSearchSelectProps {
    selectedProducts: Array<string | number>;
    onChange: (ids: Array<string | number>) => void;
    /** Shown in the dropdown when a product is already in the list. */
    alreadySelectedLabel?: string;
}

export default function ProductSearchSelect({
    selectedProducts,
    onChange,
    alreadySelectedLabel = 'Already selected',
}: ProductSearchSelectProps) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<ProductSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadingSelected, setLoadingSelected] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedDetails, setSelectedDetails] = useState<ProductSearchResult[]>([]);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedProducts.length) {
            setSelectedDetails([]);
            return;
        }

        const hasUnresolved = selectedProducts.some(
            (id) =>
                !selectedDetails.find(
                    (p) =>
                        String(p.id) === String(id) &&
                        p.name &&
                        !p.name.startsWith('Product ')
                )
        );

        if (!hasUnresolved && selectedDetails.length === selectedProducts.length) {
            return;
        }

        let cancelled = false;
        setLoadingSelected(true);

        fetchProductsByIds(selectedProducts)
            .then((products) => {
                if (cancelled) return;

                const byId = new Map(products.map((p) => [String(p.id), p]));
                setSelectedDetails(
                    selectedProducts.map((id) => {
                        const key = String(id);
                        return byId.get(key) || { id: key, name: `Product ${key}` };
                    })
                );
            })
            .catch(() => {
                if (cancelled) return;
                setSelectedDetails(
                    selectedProducts.map((id) => ({
                        id: String(id),
                        name: `Product ${id}`,
                    }))
                );
            })
            .finally(() => {
                if (!cancelled) setLoadingSelected(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when ID list changes
    }, [selectedProducts.join(',')]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search.trim()) {
                setSearching(true);
                searchProducts(search.trim())
                    .then(setResults)
                    .catch(() => setResults([]))
                    .finally(() => setSearching(false));
            } else {
                setResults([]);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [search]);

    const handleSelect = (product: ProductSearchResult) => {
        const selected = selectedProducts.map(String);
        if (!selected.includes(String(product.id))) {
            onChange([...selectedProducts, String(product.id)]);
            setSelectedDetails((prev) => {
                const without = prev.filter((p) => String(p.id) !== String(product.id));
                return [...without, { ...product, id: String(product.id) }];
            });
        }
        setSearch('');
        setShowDropdown(false);
    };

    const handleRemove = (id: string | number) => {
        onChange(selectedProducts.filter((pId) => String(pId) !== String(id)));
        setSelectedDetails((prev) => prev.filter((p) => String(p.id) !== String(id)));
    };

    const showResults = showDropdown && Boolean(search.trim());

    return (
        <div ref={rootRef} className="space-y-3">
            {selectedDetails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedDetails.map((p) => (
                        <span
                            key={p.id}
                            className="inline-flex items-center gap-1.5 bg-primary/5 text-primary px-3 py-1 rounded-full text-sm font-medium"
                        >
                            {p.name}
                            <button
                                type="button"
                                onClick={() => handleRemove(p.id)}
                                className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${p.name}`}
                            >
                                <X size={14} />
                            </button>
                        </span>
                    ))}
                    {loadingSelected && (
                        <span className="inline-flex items-center text-xs text-gray-400 gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            Loading names…
                        </span>
                    )}
                </div>
            )}

            <div className="relative">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    size={18}
                />
                {searching && (
                    <Loader2
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary animate-spin"
                        size={18}
                    />
                )}
                <input
                    type="text"
                    className="tnxl-input !pl-11 pr-10"
                    placeholder="Search products by name…"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                />
            </div>

            {showResults && (
                <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm max-h-60 overflow-y-auto">
                    {searching && results.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-500">Searching products…</p>
                    ) : results.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-500">
                            No products found for &quot;{search.trim()}&quot;
                        </p>
                    ) : (
                        results.map((product) => {
                            const alreadySelected = selectedProducts
                                .map(String)
                                .includes(String(product.id));

                            return (
                                <button
                                    key={product.id}
                                    type="button"
                                    disabled={alreadySelected}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleSelect(product)}
                                >
                                    <span className="font-medium text-gray-900">{product.name}</span>
                                    <span className="block text-xs text-gray-500 mt-0.5">
                                        {product.sku && <>SKU: {product.sku} · </>}
                                        ID: {product.id}
                                        {alreadySelected && ` · ${alreadySelectedLabel}`}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
