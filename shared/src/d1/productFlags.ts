import { all, boolInt, first, run } from './client.js';

export type ProductFlags = {
    isDocument: boolean;
    isBoxedProduct: boolean;
    shippingEligible: boolean;
};

const DEFAULT_FLAGS: ProductFlags = {
    isDocument: false,
    isBoxedProduct: false,
    shippingEligible: true,
};

type FlagRow = {
    product_id: string;
    is_document: number;
    is_boxed: number;
    shipping_eligible: number;
};

export async function getProductFlags(instanceId: string, productId: string): Promise<ProductFlags> {
    const data = await first<FlagRow>(
        `SELECT product_id, is_document, is_boxed, shipping_eligible
         FROM product_flags
         WHERE instance_id = ? AND product_id = ?`,
        instanceId,
        String(productId)
    );
    if (!data) return { ...DEFAULT_FLAGS };

    return {
        isDocument: Boolean(data.is_document),
        isBoxedProduct: Boolean(data.is_boxed),
        shippingEligible: data.shipping_eligible !== 0,
    };
}

export async function setProductFlags(
    instanceId: string,
    productId: string,
    flags: ProductFlags
): Promise<ProductFlags> {
    await run(
        `INSERT INTO product_flags (instance_id, product_id, is_document, is_boxed, shipping_eligible, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, product_id) DO UPDATE SET
           is_document = excluded.is_document,
           is_boxed = excluded.is_boxed,
           shipping_eligible = excluded.shipping_eligible,
           updated_at = excluded.updated_at`,
        instanceId,
        String(productId),
        boolInt(flags.isDocument),
        boolInt(flags.isBoxedProduct),
        boolInt(flags.shippingEligible),
        new Date().toISOString()
    );

    return flags;
}

export async function resolveProductFlagMap(
    instanceId: string,
    productIds: string[],
    field: 'is_document' | 'is_boxed' | 'shipping_eligible'
): Promise<Record<string, boolean>> {
    if (!productIds.length) return {};

    const rows = await all<FlagRow>(
        `SELECT product_id, is_document, is_boxed, shipping_eligible
         FROM product_flags
         WHERE instance_id = ?
           AND product_id IN (SELECT value FROM json_each(?))`,
        instanceId,
        JSON.stringify(productIds.map(String))
    );

    const result: Record<string, boolean> = {};
    for (const row of rows) {
        const id = String(row.product_id);
        if (field === 'is_document') result[id] = Boolean(row.is_document);
        else if (field === 'is_boxed') result[id] = Boolean(row.is_boxed);
        else result[id] = row.shipping_eligible !== 0;
    }

    return result;
}
