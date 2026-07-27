import {
    getProductPhysicalOverridesMap,
    mergeProductPhysical,
    type MergedProductPhysical,
    type ProductPhysicalOverride,
} from '@thai-nexus/shared';
import {
    fetchWixProductPhysicalMap,
    type WixProductPhysical,
} from './catalog.js';

export async function resolveProductPhysicalMap(
    instanceId: string,
    accessToken: string,
    productIds: string[],
    siteId?: string | null
): Promise<Record<string, MergedProductPhysical>> {
    const wixMap = await fetchWixProductPhysicalMap(accessToken, productIds, siteId);
    let overrides: Record<string, ProductPhysicalOverride> = {};
    try {
        overrides = await getProductPhysicalOverridesMap(instanceId, productIds);
    } catch (err) {
        console.warn(
            '[product-physical] override load skipped',
            err instanceof Error ? err.message : err
        );
    }

    const out: Record<string, MergedProductPhysical> = {};
    for (const id of productIds) {
        const wix = wixMap[id] as WixProductPhysical | undefined;
        out[id] = mergeProductPhysical(
            wix ? { ...wix, productId: wix.productId || id } : { productId: id },
            overrides[id]
        );
    }
    return out;
}
