import { getProductFlags, setProductFlags, type ProductFlags } from './productFlags.js';
import { getSupabase } from './client.js';

export const PHYSICAL_OVERRIDE_MIGRATION_SQL =
    'alter table product_flags add column if not exists physical_override jsonb;';

export type ProductPhysicalOverride = {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
};

export async function supabaseHasPhysicalOverrideColumn(): Promise<boolean> {
    const { error } = await getSupabase()
        .from('product_flags')
        .select('physical_override')
        .limit(0);
    if (!error) return true;
    if (error.message?.includes('physical_override')) return false;
    return true;
}

export type MergedProductPhysical = {
    productId: string;
    name?: string;
    sku?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    fromOverride?: boolean;
};

export function mergeProductPhysical(
    wix: MergedProductPhysical | undefined,
    override?: ProductPhysicalOverride | null
): MergedProductPhysical {
    const base = wix || { productId: '' };
    if (!override) return base;

    const merged: MergedProductPhysical = {
        ...base,
        productId: base.productId || wix?.productId || '',
        weightKg: override.weightKg ?? base.weightKg,
        lengthCm: override.lengthCm ?? base.lengthCm,
        widthCm: override.widthCm ?? base.widthCm,
        heightCm: override.heightCm ?? base.heightCm,
    };

    if (
        override.weightKg != null ||
        override.lengthCm != null ||
        override.widthCm != null ||
        override.heightCm != null
    ) {
        merged.fromOverride = true;
    }

    return merged;
}

function parseOverride(raw: unknown): ProductPhysicalOverride | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const weightKg = typeof o.weightKg === 'number' ? o.weightKg : undefined;
    const lengthCm = typeof o.lengthCm === 'number' ? o.lengthCm : undefined;
    const widthCm = typeof o.widthCm === 'number' ? o.widthCm : undefined;
    const heightCm = typeof o.heightCm === 'number' ? o.heightCm : undefined;
    if (weightKg == null && lengthCm == null && widthCm == null && heightCm == null) {
        return null;
    }
    return { weightKg, lengthCm, widthCm, heightCm };
}

export async function getProductPhysicalOverride(
    instanceId: string,
    productId: string
): Promise<ProductPhysicalOverride | null> {
    const { data, error } = await getSupabase()
        .from('product_flags')
        .select('physical_override')
        .eq('instance_id', instanceId)
        .eq('product_id', String(productId))
        .maybeSingle();

    if (error) {
        if (error.message?.includes('physical_override')) return null;
        throw error;
    }

    return parseOverride(data?.physical_override);
}

export async function getProductPhysicalOverridesMap(
    instanceId: string,
    productIds: string[]
): Promise<Record<string, ProductPhysicalOverride>> {
    if (!productIds.length) return {};

    const { data, error } = await getSupabase()
        .from('product_flags')
        .select('product_id, physical_override')
        .eq('instance_id', instanceId)
        .in('product_id', productIds.map(String));

    if (error) {
        if (error.message?.includes('physical_override')) return {};
        throw error;
    }

    const map: Record<string, ProductPhysicalOverride> = {};
    for (const row of data || []) {
        const parsed = parseOverride(row.physical_override);
        if (parsed) map[String(row.product_id)] = parsed;
    }
    return map;
}

export async function setProductPhysicalOverride(
    instanceId: string,
    productId: string,
    override: ProductPhysicalOverride
): Promise<void> {
    const flags: ProductFlags = await getProductFlags(instanceId, productId);

    const { error } = await getSupabase().from('product_flags').upsert({
        instance_id: instanceId,
        product_id: String(productId),
        is_document: flags.isDocument,
        is_boxed: flags.isBoxedProduct,
        shipping_eligible: flags.shippingEligible,
        physical_override: override,
        updated_at: new Date().toISOString(),
    });

    if (error) throw error;
}

export function readyForRatesFromPhysical(p: {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
}): boolean {
    return (
        Boolean(p.weightKg && p.weightKg > 0) &&
        Boolean(p.lengthCm && p.lengthCm > 0) &&
        Boolean(p.widthCm && p.widthCm > 0) &&
        Boolean(p.heightCm && p.heightCm > 0)
    );
}
