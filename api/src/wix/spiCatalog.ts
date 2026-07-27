/** Wix SPI line item catalogReference (Stores V1/V3). */

export type WixSpiCatalogReference = {
    catalogItemId?: string;
    appId?: string;
    options?: Record<string, unknown>;
};

export type WixSpiLineItem = {
    catalogReference?: WixSpiCatalogReference;
    physicalProperties?: { sku?: string; weight?: number; shippable?: boolean };
};

/**
 * All GUIDs Wix may use for catalog / variant on a checkout line.
 * @see https://dev.wix.com/docs/api-reference/.../get-shipping-rates
 */
export function spiLineCatalogKeys(line: WixSpiLineItem): string[] {
    const keys = new Set<string>();
    const catalog = line.catalogReference || {};
    if (catalog.catalogItemId) keys.add(String(catalog.catalogItemId));

    const options = catalog.options;
    if (options && typeof options === 'object') {
        const variantId = options.variantId;
        if (variantId != null && variantId !== '') keys.add(String(variantId));
        const nested = options.options;
        if (nested && typeof nested === 'object') {
            const nestedVariant = (nested as Record<string, unknown>).variantId;
            if (nestedVariant != null && nestedVariant !== '') {
                keys.add(String(nestedVariant));
            }
        }
    }

    const sku = line.physicalProperties?.sku;
    if (sku) keys.add(String(sku));

    return [...keys];
}

/** Primary product id for flags (prefer product catalogItemId; Wix sends variant in options). */
export function spiLinePrimaryProductId(line: WixSpiLineItem, fallback: string): string {
    const keys = spiLineCatalogKeys(line);
    return keys[0] || fallback;
}

export function pickMergedPhysical<T extends Record<string, unknown>>(
    map: Record<string, T | undefined>,
    keys: string[]
): T | undefined {
    for (const id of keys) {
        const hit = map[id];
        if (hit) return hit;
    }
    return undefined;
}
