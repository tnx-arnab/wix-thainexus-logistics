import { getSupabase } from './client.js';

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

export async function getProductFlags(
    instanceId: string,
    productId: string
): Promise<ProductFlags> {
    const { data, error } = await getSupabase()
        .from('product_flags')
        .select('is_document, is_boxed, shipping_eligible')
        .eq('instance_id', instanceId)
        .eq('product_id', String(productId))
        .maybeSingle();

    if (error) throw error;
    if (!data) return { ...DEFAULT_FLAGS };

    return {
        isDocument: Boolean(data.is_document),
        isBoxedProduct: Boolean(data.is_boxed),
        shippingEligible: data.shipping_eligible !== false,
    };
}

export async function setProductFlags(
    instanceId: string,
    productId: string,
    flags: ProductFlags
): Promise<ProductFlags> {
    const { error } = await getSupabase().from('product_flags').upsert({
        instance_id: instanceId,
        product_id: String(productId),
        is_document: flags.isDocument,
        is_boxed: flags.isBoxedProduct,
        shipping_eligible: flags.shippingEligible,
        updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    return flags;
}

export async function resolveProductFlagMap(
    instanceId: string,
    productIds: string[],
    field: 'is_document' | 'is_boxed' | 'shipping_eligible'
): Promise<Record<string, boolean>> {
    if (!productIds.length) return {};

    const { data, error } = await getSupabase()
        .from('product_flags')
        .select('product_id, is_document, is_boxed, shipping_eligible')
        .eq('instance_id', instanceId)
        .in('product_id', productIds.map(String));

    if (error) throw error;

    const result: Record<string, boolean> = {};
    for (const row of data || []) {
        const id = String(row.product_id);
        if (field === 'is_document') result[id] = Boolean(row.is_document);
        else if (field === 'is_boxed') result[id] = Boolean(row.is_boxed);
        else result[id] = row.shipping_eligible !== false;
    }

    return result;
}
