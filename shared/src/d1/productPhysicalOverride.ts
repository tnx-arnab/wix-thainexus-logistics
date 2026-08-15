import { getProductFlags, type ProductFlags } from './productFlags.js';
import { all, first, parseJson, run, toJson } from './client.js';

export type ProductPhysicalOverride = {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
};

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
    let value = raw;
    if (typeof raw === 'string') {
        try {
            value = parseJson<unknown>(raw, null);
        } catch {
            return null;
        }
    }
    if (!value || typeof value !== 'object') return null;
    const o = value as Record<string, unknown>;
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
    const row = await first<{ physical_override: string | null }>(
        `SELECT physical_override FROM product_flags
         WHERE instance_id = ? AND product_id = ?`,
        instanceId,
        String(productId)
    );
    return parseOverride(row?.physical_override);
}

export async function getProductPhysicalOverridesMap(
    instanceId: string,
    productIds: string[]
): Promise<Record<string, ProductPhysicalOverride>> {
    if (!productIds.length) return {};

    const rows = await all<{ product_id: string; physical_override: string | null }>(
        `SELECT product_id, physical_override
         FROM product_flags
         WHERE instance_id = ?
           AND product_id IN (SELECT value FROM json_each(?))`,
        instanceId,
        JSON.stringify(productIds.map(String))
    );

    const map: Record<string, ProductPhysicalOverride> = {};
    for (const row of rows) {
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

    await run(
        `INSERT INTO product_flags (
            instance_id, product_id, is_document, is_boxed, shipping_eligible, physical_override, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, product_id) DO UPDATE SET
           is_document = excluded.is_document,
           is_boxed = excluded.is_boxed,
           shipping_eligible = excluded.shipping_eligible,
           physical_override = excluded.physical_override,
           updated_at = excluded.updated_at`,
        instanceId,
        String(productId),
        flags.isDocument ? 1 : 0,
        flags.isBoxedProduct ? 1 : 0,
        flags.shippingEligible ? 1 : 0,
        toJson(override),
        new Date().toISOString()
    );
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
