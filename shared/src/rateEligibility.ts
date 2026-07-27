import { validateShipper } from './validation.js';
import { cartQualifiesForRetailBoxing } from './packing.js';
import { BcAddress, BcRateItem, StoreConfig } from './types/thaiNexus.js';

export function rateItemCatalogIds(item: BcRateItem): string[] {
    const ids = new Set<string>();
    if (item.product_id) ids.add(String(item.product_id));
    for (const id of item.catalog_lookup_ids || []) {
        if (id) ids.add(String(id));
    }
    return [...ids];
}

export const METAFIELD_SHIPPING_ELIGIBLE = 'shipping_eligible';

function positiveNum(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Line item has real weight and dimensions (not packing defaults). */
export function itemHasMeasurements(item: BcRateItem): boolean {
    return (
        positiveNum(item.length?.value) != null &&
        positiveNum(item.width?.value) != null &&
        positiveNum(item.height?.value) != null &&
        positiveNum(item.weight?.value) != null
    );
}

export function validateDestination(dest: BcAddress): string | null {
    if (!dest.country_iso2?.trim()) {
        return 'Complete the shipping country before Thai Nexus rates are available.';
    }
    if (!dest.zip?.trim()) {
        return 'Complete the shipping postal code before Thai Nexus rates are available.';
    }
    if (!dest.city?.trim()) {
        return 'Complete the shipping city before Thai Nexus rates are available.';
    }

    return null;
}

export function validateCartMeasurements(items: BcRateItem[]): string | null {
    if (!items.length) {
        return 'Add items to the cart before Thai Nexus rates are available.';
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!itemHasMeasurements(item)) {
            const label = item.name?.trim() || `Item ${i + 1}`;
            return `"${label}" is missing weight or dimensions - Thai Nexus rates are hidden until every product has them.`;
        }
    }

    return null;
}

export function validateStoreReadyForRates(
    config: StoreConfig | null | undefined,
    hasToken: boolean,
    options?: { requireBoxes?: boolean }
): string | null {
    if (!hasToken) {
        return 'Thai Nexus is not configured. Add an API token in Apps → Thai Nexus.';
    }

    if (!config) {
        return 'Thai Nexus store settings are not saved yet.';
    }

    const shipperError = validateShipper(config.shipper);
    if (shipperError) {
        return `${shipperError} Complete store settings in Apps → Thai Nexus.`;
    }

    const requireBoxes = options?.requireBoxes !== false;
    if (requireBoxes) {
        const usableBoxes = (config.boxes || []).filter(
            (b) =>
                b.name?.trim() &&
                positiveNum(b.innerLengthCm) &&
                positiveNum(b.innerWidthCm) &&
                positiveNum(b.innerDepthCm) &&
                positiveNum(b.maxWeightKg)
        );
        if (!usableBoxes.length) {
            return 'Configure at least one shipping box in Apps → Thai Nexus before rates can be shown.';
        }
    }

    return null;
}

/**
 * Every cart line must map to a product id and be shipping-eligible.
 * Missing metafield = eligible (default). Explicit `shipping_eligible: false` = ineligible.
 */
export function validateAllProductsEligible(
    items: BcRateItem[],
    eligibleByProductId: Record<string, boolean>
): string | null {
    if (!items.length) {
        return 'Add items to the cart before Thai Nexus rates are available.';
    }

    const checked = new Set<string>();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const ids = rateItemCatalogIds(item);
        const productId = ids[0] || '';
        if (!productId) {
            return 'Thai Nexus rates require a product id on every cart item.';
        }
        const dedupeKey = ids.sort().join('|');
        if (checked.has(dedupeKey)) continue;
        checked.add(dedupeKey);

        const ineligible = ids.some((id) => eligibleByProductId[id] === false);
        if (ineligible) {
            const label = item.name?.trim() || `Product ${productId}`;
            return `"${label}" is not enabled for Thai Nexus shipping - rates are hidden until every product in the cart is eligible.`;
        }
    }

    return null;
}

export function validateRateRequest(input: {
    destination: BcAddress;
    items: BcRateItem[];
    config: StoreConfig | null | undefined;
    hasToken: boolean;
    eligibleByProductId?: Record<string, boolean>;
    boxedProductFlags?: Record<string, boolean>;
}): string | null {
    const retailBoxing = cartQualifiesForRetailBoxing(
        input.items,
        input.boxedProductFlags ?? {}
    );

    const checks = [
        () =>
            validateStoreReadyForRates(input.config, input.hasToken, {
                requireBoxes: !retailBoxing,
            }),
        () => validateDestination(input.destination),
        () => validateCartMeasurements(input.items),
        () =>
            validateAllProductsEligible(
                input.items,
                input.eligibleByProductId ?? {}
            ),
    ];

    for (const check of checks) {
        const message = check();
        if (message) return message;
    }

    return null;
}

/** Merge per-product metafields with bulk exclusions saved in Settings. */
export function mergeShippingEligibleFlags(
    metafieldFlags: Record<string, boolean>,
    configIneligibleProductIds: Array<string | number> | undefined
): Record<string, boolean> {
    const merged = { ...metafieldFlags };

    for (const id of configIneligibleProductIds || []) {
        merged[String(id)] = false;
    }

    return merged;
}

/** Metafield value → eligible. Absent / true = eligible; only explicit false opts out. */
export function parseShippingEligibleMetafield(value: unknown): boolean {
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
        const v = value.toLowerCase().trim();
        if (v === 'false' || v === '0' || v === 'no') return false;
    }

    return true;
}
