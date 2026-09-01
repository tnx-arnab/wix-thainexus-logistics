import { extractHsCodeFromRecord, type ProductSearchResult } from '@thai-nexus/shared';

const STORES_CATALOG_APP = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

export type WixProductPhysical = {
    productId: string;
    name?: string;
    sku?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    hsCode?: string;
};

function wixAuthHeaders(accessToken: string, siteId?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: accessToken.trim(),
        'Content-Type': 'application/json',
    };
    const site = siteId?.trim();
    if (site) headers['wix-site-id'] = site;
    return headers;
}

async function wixGet(
    accessToken: string,
    path: string,
    query?: Record<string, string | string[]>,
    siteId?: string | null
): Promise<unknown> {
    const url = new URL(`https://www.wixapis.com${path}`);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (Array.isArray(v)) {
                for (const item of v) {
                    if (item) url.searchParams.append(k, item);
                }
            } else if (v) {
                url.searchParams.set(k, v);
            }
        }
    }

    const res = await fetch(url.toString(), {
        headers: wixAuthHeaders(accessToken, siteId),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg =
            (data as { message?: string }).message ||
            `Wix API ${path} failed (${res.status})`;
        throw new Error(msg);
    }

    return data;
}

/** Catalog V1: weight is often on variants or stock, units often LB. */
function weightKgFromV1Product(product: Record<string, unknown>): number | undefined {
    const defaultUnit = String(
        product.weightUnit || product.weightMeasurementUnit || 'LB'
    );

    const fromRaw = (raw: unknown, unit?: string) =>
        toKg(positive(raw), (unit || defaultUnit).toUpperCase());

    const phys = (product.physicalProperties || {}) as Record<string, unknown>;
    const stock = (product.stock || {}) as Record<string, unknown>;

    let best =
        fromRaw(phys.weight, String(phys.weightUnit || defaultUnit)) ??
        fromRaw(product.weight, defaultUnit) ??
        fromRaw(product.shippingWeight, defaultUnit) ??
        fromRaw(stock.weight, String(stock.weightUnit || defaultUnit));

    const range = product.weightRange as { maxValue?: number; minValue?: number } | undefined;
    if (!best && range) {
        best = fromRaw(range.maxValue ?? range.minValue, defaultUnit);
    }

    const variantLists: Record<string, unknown>[][] = [];
    for (const key of ['variants', 'productVariants', 'variantSummaries'] as const) {
        const list = product[key];
        if (Array.isArray(list)) variantLists.push(list as Record<string, unknown>[]);
    }

    for (const list of variantLists) {
        for (const variant of list) {
            const vStock = (variant.stock || {}) as Record<string, unknown>;
            const w =
                fromRaw(variant.weight, String(variant.weightUnit || defaultUnit)) ??
                fromRaw(vStock.weight, String(vStock.weightUnit || defaultUnit));
            if (w && (!best || w > best)) best = w;
        }
    }

    return best;
}

function positive(n: unknown): number | undefined {
    const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
    return Number.isFinite(v) && v > 0 ? v : undefined;
}

function toKg(weight: number | undefined, unit?: string): number | undefined {
    if (weight == null) return undefined;
    const u = String(unit || 'KG').toUpperCase();
    if (u === 'LB' || u === 'LBS' || u === 'POUND' || u === 'POUNDS') {
        return weight * 0.45359237;
    }
    if (u === 'G' || u === 'GRAM' || u === 'GRAMS') {
        return weight / 1000;
    }
    return weight;
}

function toCm(value: number | undefined, unit?: string): number | undefined {
    if (value == null) return undefined;
    const u = String(unit || 'CM').toUpperCase();
    if (u === 'IN' || u === 'INCH' || u === 'INCHES') {
        return value * 2.54;
    }
    if (u === 'MM') return value / 10;
    if (u === 'M' || u === 'METER' || u === 'METERS') return value * 100;
    return value;
}

function dimsFromWixDimensions(block: Record<string, unknown> | undefined): {
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
} {
    if (!block || typeof block !== 'object') return {};
    const unit = String(block.unit || block.dimensionUnit || 'CM');
    const lengthCm = toCm(positive(block.length ?? block.lengthCm), unit);
    const widthCm = toCm(positive(block.width ?? block.widthCm), unit);
    const heightCm = toCm(
        positive(block.height ?? block.heightCm ?? block.depth),
        unit
    );
    return { lengthCm, widthCm, heightCm };
}

/** Pull L/W/H from common Wix product field shapes / custom text. */
function dimsFromProduct(product: Record<string, unknown>): {
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
} {
    const packageDims = dimsFromWixDimensions(
        product.packageDimensions as Record<string, unknown> | undefined
    );
    const productDims = dimsFromWixDimensions(
        product.productDimensions as Record<string, unknown> | undefined
    );

    const phys = (product.physicalProperties || product.shippingDetails || {}) as Record<
        string,
        unknown
    >;
    const unit = String(phys.dimensionUnit || product.dimensionUnit || 'CM');

    let lengthCm =
        packageDims.lengthCm ??
        productDims.lengthCm ??
        toCm(positive(phys.length ?? product.length ?? product.lengthCm), unit);
    let widthCm =
        packageDims.widthCm ??
        productDims.widthCm ??
        toCm(positive(phys.width ?? product.width ?? product.widthCm), unit);
    let heightCm =
        packageDims.heightCm ??
        productDims.heightCm ??
        toCm(
            positive(phys.height ?? product.height ?? product.heightCm ?? product.depth),
            unit
        );

    const custom =
        (product.customFields as Array<Record<string, unknown>>) ||
        (product.additionalInfoSections as Array<Record<string, unknown>>) ||
        [];

    for (const field of custom) {
        const key = String(field.name || field.title || field.key || '')
            .toLowerCase()
            .replace(/\s+/g, '_');
        const val = positive(field.value ?? field.content ?? field.plainText);
        if (!val) continue;
        if (!lengthCm && (key.includes('length') || key === 'l' || key === 'long')) {
            lengthCm = toCm(val, 'CM');
        }
        if (!widthCm && (key.includes('width') || key === 'w')) {
            widthCm = toCm(val, 'CM');
        }
        if (
            !heightCm &&
            (key.includes('height') || key.includes('depth') || key === 'h')
        ) {
            heightCm = toCm(val, 'CM');
        }
    }

    return { lengthCm, widthCm, heightCm };
}

export function physicalFromWixProduct(
    productId: string,
    product: Record<string, unknown>
): WixProductPhysical {
    if (product.variantsInfo != null || product.productType != null) {
        return physicalFromV3Product(productId, product);
    }

    const phys = (product.physicalProperties || {}) as Record<string, unknown>;
    const weightKg = weightKgFromV1Product(product) ?? toKg(
        positive(
            phys.weight ??
                product.weight ??
                product.shippingWeight ??
                (product.stock as Record<string, unknown> | undefined)?.weight
        ),
        String(phys.weightUnit || product.weightUnit || product.weightMeasurementUnit || 'LB')
    );
    const dims = dimsFromProduct(product);

    return {
        productId,
        name: typeof product.name === 'string' ? product.name : undefined,
        sku: typeof product.sku === 'string' ? product.sku : undefined,
        weightKg,
        ...dims,
        hsCode: extractHsCodeFromRecord(product) || undefined,
    };
}

/** Catalog V3: weight/dims usually live on variants. */
export function physicalFromV3Product(
    productId: string,
    product: Record<string, unknown>
): WixProductPhysical {
    const name = typeof product.name === 'string' ? product.name : undefined;
    const variants = (
        (product.variantsInfo as { variants?: unknown[] } | undefined)?.variants || []
    ) as Record<string, unknown>[];

    let weightKg: number | undefined;
    let lengthCm: number | undefined;
    let widthCm: number | undefined;
    let heightCm: number | undefined;
    let sku: string | undefined;

    const weightUnit = String(
        (
            (product.physicalProperties as Record<string, unknown> | undefined)
                ?.weightMeasurementUnitInfo as { weightMeasurementUnit?: string } | undefined
        )?.weightMeasurementUnit || 'KG'
    );

    for (const variant of variants) {
        const phys = (variant.physicalProperties || {}) as Record<string, unknown>;
        if (!sku && typeof variant.sku === 'string') sku = variant.sku;

        const w = toKg(positive(phys.weight ?? phys.shippingWeight), weightUnit);
        if (w && (!weightKg || w > weightKg)) weightKg = w;

        const pkg = dimsFromWixDimensions(
            phys.packageDimensions as Record<string, unknown> | undefined
        );
        const prod = dimsFromWixDimensions(
            phys.productDimensions as Record<string, unknown> | undefined
        );

        lengthCm = lengthCm ?? pkg.lengthCm ?? prod.lengthCm;
        widthCm = widthCm ?? pkg.widthCm ?? prod.widthCm;
        heightCm = heightCm ?? pkg.heightCm ?? prod.heightCm;
    }

    const topPhys = (product.physicalProperties || {}) as Record<string, unknown>;
    const range = topPhys.shippingWeightRange as { maxValue?: number } | undefined;
    if (!weightKg && range?.maxValue != null) {
        weightKg = toKg(positive(range.maxValue), weightUnit);
    }

    const topDims = dimsFromProduct(product);
    return {
        productId,
        name,
        sku,
        weightKg,
        lengthCm: lengthCm ?? topDims.lengthCm,
        widthCm: widthCm ?? topDims.widthCm,
        heightCm: heightCm ?? topDims.heightCm,
        hsCode: extractHsCodeFromRecord(product) || undefined,
    };
}

function catalogPermissionError(message: string): boolean {
    return /READ_PRODUCTS|PRODUCT_READ|PRODUCT_WRITE|Permission|permission scope/i.test(
        message
    );
}

function v1CatalogHint(message: string): string {
    if (!catalogPermissionError(message)) return message;
    return `${message} — This site uses Catalog V1: keep **Manage Products** (or add **Read Products**), then **Test app → reinstall** on the site.`;
}

type WixCatalogKind = 'v1' | 'v3';

const catalogVersionCache = new Map<string, WixCatalogKind>();

/** GET /stores/v3/provision/version — pick V1 vs V3 API for this site. */
async function resolveWixCatalogVersion(
    accessToken: string,
    siteId?: string | null
): Promise<WixCatalogKind> {
    const key = `${siteId?.trim() || 'site'}:${accessToken.slice(-20)}`;
    const cached = catalogVersionCache.get(key);
    if (cached) return cached;

    try {
        const data = (await wixGet(
            accessToken,
            '/stores/v3/provision/version',
            undefined,
            siteId
        )) as { catalogVersion?: string };
        const kind: WixCatalogKind =
            data.catalogVersion === 'V3_CATALOG' ? 'v3' : 'v1';
        catalogVersionCache.set(key, kind);
        return kind;
    } catch {
        catalogVersionCache.set(key, 'v1');
        return 'v1';
    }
}

function v3ProductToSearchResult(product: Record<string, unknown>): ProductSearchResult | null {
    const id = String(product.id || '');
    if (!id) return null;
    const variants = (
        (product.variantsInfo as { variants?: unknown[] } | undefined)?.variants || []
    ) as Record<string, unknown>[];
    const sku =
        typeof product.sku === 'string'
            ? product.sku
            : variants.find((v) => typeof v.sku === 'string')?.sku as string | undefined;

    return {
        id,
        name: typeof product.name === 'string' ? product.name : 'Untitled',
        sku,
    };
}

async function searchWixProductsV3(
    accessToken: string,
    q: string,
    limit: number,
    siteId?: string | null
): Promise<ProductSearchResult[]> {
    const term = (q || '').trim();
    const cap = Math.min(limit, 100);

    const body = term
        ? {
              search: {
                  expression: term,
                  fields: ['name', 'sku'],
              },
              fields: [] as string[],
          }
        : {
              query: {
                  filter: { visible: true },
                  cursorPaging: { limit: cap },
              },
              fields: [] as string[],
          };

    const path = term ? '/stores/v3/products/search' : '/stores/v3/products/query';
    const { ok, status, data } = await wixPostJson(accessToken, path, body, siteId);

    if (!ok) {
        const message =
            (data.message as string) ||
            `Catalog V3 product search failed (${status}). Add Product read (V3) and reinstall the app.`;
        throw new Error(message);
    }

    const products = (data.products as Record<string, unknown>[]) || [];
    return products
        .map((p) => v3ProductToSearchResult(p))
        .filter((p): p is ProductSearchResult => Boolean(p));
}

async function fetchWixProductRecord(
    accessToken: string,
    productId: string,
    siteId?: string | null
): Promise<Record<string, unknown> | null> {
    const kind = await resolveWixCatalogVersion(accessToken, siteId);
    if (kind === 'v3') {
        const data = (await wixGet(
            accessToken,
            `/stores/v3/products/${productId}`,
            { fields: ['INFO_SECTION', 'INFO_SECTION_PLAIN_DESCRIPTION'] },
            siteId
        )) as { product?: Record<string, unknown> };
        return data.product || null;
    }

    const data = (await wixGet(
        accessToken,
        `/stores/v1/products/${productId}`,
        { includeVariants: 'true' },
        siteId
    )) as { product?: Record<string, unknown> };

    let product = data.product || null;
    if (product) {
        if (weightKgFromV1Product(product) == null) {
            try {
                const slim = (await wixGet(
                    accessToken,
                    `/stores/v1/products/${productId}`,
                    undefined,
                    siteId
                )) as { product?: Record<string, unknown> };
                if (slim.product) {
                    product = { ...product, ...slim.product, variants: product.variants };
                }
            } catch {
                // optional
            }
        }
        if (weightKgFromV1Product(product) == null) {
            try {
                const variantsPayload = (await wixGet(
                    accessToken,
                    `/stores/v1/products/${productId}/variants`,
                    undefined,
                    siteId
                )) as { variants?: unknown[] };
                if (variantsPayload.variants?.length) {
                    product = { ...product, variants: variantsPayload.variants };
                }
            } catch {
                // optional
            }
        }
    }

    return product;
}

async function updateWixProductPackageDimensionsV3(
    accessToken: string,
    productId: string,
    dims: { lengthCm: number; widthCm: number; heightCm: number },
    siteId?: string | null,
    weightLb?: number
): Promise<void> {
    const product = await fetchWixProductRecord(accessToken, productId, siteId);
    if (!product) throw new Error('Product not found');

    const revision = product.revision;
    if (revision == null || revision === '') {
        throw new Error('Catalog V3 product revision missing');
    }

    const variants = (
        (product.variantsInfo as { variants?: unknown[] } | undefined)?.variants || []
    ) as Record<string, unknown>[];

    const packageDimensions = {
        length: String(dims.lengthCm),
        width: String(dims.widthCm),
        height: String(dims.heightCm),
        unit: 'CM',
    };

    const weightKg =
        weightLb != null && Number.isFinite(weightLb) && weightLb > 0
            ? weightLb * 0.45359237
            : undefined;

    const payload: Record<string, unknown> = {
        product: {
            id: productId,
            revision,
            variantsInfo: {
                variants: variants.map((variant) => ({
                    id: variant.id,
                    revision: variant.revision,
                    physicalProperties: {
                        ...(variant.physicalProperties as Record<string, unknown> | undefined),
                        packageDimensions,
                        ...(weightKg != null ? { weight: weightKg } : {}),
                    },
                })),
            },
        },
    };

    const { ok, status, data } = await wixPatchJson(
        accessToken,
        `/stores/v3/products/${productId}`,
        payload,
        siteId
    );

    if (!ok) {
        const message =
            (data.message as string) ||
            `Could not save package dimensions via Catalog V3 (${status}). Add Product write (V3) permission and reinstall.`;
        throw new Error(message);
    }
}

/**
 * Search Wix Stores products (Catalog V1 query).
 * Caps results for admin pickers (~250).
 */
async function wixPostJson(
    accessToken: string,
    path: string,
    body: unknown,
    siteId?: string | null
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const res = await fetch(`https://www.wixapis.com${path}`, {
        method: 'POST',
        headers: wixAuthHeaders(accessToken, siteId),
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
}

async function wixPatchJson(
    accessToken: string,
    path: string,
    body: unknown,
    siteId?: string | null
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const res = await fetch(`https://www.wixapis.com${path}`, {
        method: 'PATCH',
        headers: wixAuthHeaders(accessToken, siteId),
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
}

async function searchWixProductsV1(
    accessToken: string,
    q: string,
    limit: number,
    siteId?: string | null
): Promise<ProductSearchResult[]> {
    const query = (q || '').trim();
    const body = {
        query: {
            filter: query
                ? JSON.stringify({
                      $or: [
                          { name: { $contains: query } },
                          { sku: { $contains: query } },
                      ],
                  })
                : JSON.stringify({ visible: true }),
            paging: { limit: Math.min(limit, 100) },
        },
        includeVariants: false,
    };

    const { ok, status, data } = await wixPostJson(
        accessToken,
        '/stores/v1/products/query',
        body,
        siteId
    );

    if (!ok) {
        const message =
            (data.message as string) ||
            (data.details as { message?: string } | undefined)?.message ||
            `Product search failed (${status}).`;
        throw new Error(v1CatalogHint(message));
    }

    const products = (data.products as Array<{ id?: string; name?: string; sku?: string }>) || [];

    return products
        .map((p) => ({
            id: String(p.id || ''),
            name: p.name || 'Untitled',
            sku: p.sku,
        }))
        .filter((p) => p.id);
}

async function updateWixProductPackageDimensionsV1(
    accessToken: string,
    productId: string,
    dims: { lengthCm: number; widthCm: number; heightCm: number },
    siteId?: string | null,
    weightLb?: number
): Promise<void> {
    const productPatch: Record<string, unknown> = {
        packageDimensions: {
            length: String(dims.lengthCm),
            width: String(dims.widthCm),
            height: String(dims.heightCm),
            unit: 'CM',
        },
    };
    if (weightLb != null && Number.isFinite(weightLb) && weightLb > 0) {
        productPatch.weight = weightLb;
    }

    const { ok, status, data } = await wixPatchJson(
        accessToken,
        `/stores/v1/products/${productId}`,
        { product: productPatch },
        siteId
    );

    if (!ok) {
        const message =
            (data.message as string) ||
            `Could not save package dimensions (${status}). Color variants may need dims per variant in Wix.`;
        throw new Error(v1CatalogHint(message));
    }

    if (weightLb != null && Number.isFinite(weightLb) && weightLb > 0) {
        await syncV1CatalogVariantsPhysical(
            accessToken,
            productId,
            { lengthCm: dims.lengthCm, widthCm: dims.widthCm, heightCm: dims.heightCm },
            weightLb,
            siteId
        );
    }
}

/** Products with Color/options often ignore product-level weight; sync all variants. */
async function syncV1CatalogVariantsPhysical(
    accessToken: string,
    productId: string,
    dims: { lengthCm: number; widthCm: number; heightCm: number },
    weightLb: number,
    siteId?: string | null
): Promise<void> {
    try {
        const raw = (await wixGet(
            accessToken,
            `/stores/v1/products/${productId}/variants`,
            undefined,
            siteId
        )) as { variants?: Record<string, unknown>[] };
        const variants = raw.variants || [];
        if (!variants.length) return;

        const packageDimensions = {
            length: String(dims.lengthCm),
            width: String(dims.widthCm),
            height: String(dims.heightCm),
            unit: 'CM',
        };

        const { ok, data } = await wixPatchJson(
            accessToken,
            `/stores/v1/products/${productId}/variants`,
            {
                variants: variants.map((v) => {
                    const entry: Record<string, unknown> = {
                        weight: weightLb,
                        packageDimensions,
                    };
                    if (v.id) entry.id = v.id;
                    if (v.choices) entry.choices = v.choices;
                    return entry;
                }),
            },
            siteId
        );

        if (!ok) {
            console.warn(
                '[v1-variants]',
                productId,
                (data.message as string) || 'variant physical update failed'
            );
        }
    } catch (err) {
        console.warn(
            '[v1-variants]',
            productId,
            err instanceof Error ? err.message : err
        );
    }
}

export async function searchWixProducts(
    accessToken: string,
    q: string,
    limit = 50,
    siteId?: string | null
): Promise<ProductSearchResult[]> {
    const kind = await resolveWixCatalogVersion(accessToken, siteId);
    if (kind === 'v3') {
        return searchWixProductsV3(accessToken, q, limit, siteId);
    }
    return searchWixProductsV1(accessToken, q, limit, siteId);
}

/** Set shipping package L/W/H (and optional weight in lb) on the product. */
export async function updateWixProductPackageDimensions(
    accessToken: string,
    productId: string,
    dims: { lengthCm: number; widthCm: number; heightCm: number },
    siteId?: string | null,
    weightLb?: number
): Promise<void> {
    const kind = await resolveWixCatalogVersion(accessToken, siteId);
    if (kind === 'v3') {
        await updateWixProductPackageDimensionsV3(
            accessToken,
            productId,
            dims,
            siteId,
            weightLb
        );
        return;
    }
    await updateWixProductPackageDimensionsV1(
        accessToken,
        productId,
        dims,
        siteId,
        weightLb
    );
}

/** Product id plus variant ids (checkout SPI may send catalogItemId = variant id). */
export async function listWixCatalogItemIdsForPhysical(
    accessToken: string,
    productId: string,
    siteId?: string | null
): Promise<string[]> {
    const ids = new Set<string>([String(productId)]);
    try {
        const kind = await resolveWixCatalogVersion(accessToken, siteId);
        if (kind === 'v3') {
            const product = await fetchWixProductRecord(accessToken, productId, siteId);
            const variants = (
                (product?.variantsInfo as { variants?: Array<{ id?: string }> } | undefined)
                    ?.variants || []
            );
            for (const v of variants) {
                if (v.id) ids.add(String(v.id));
            }
        } else {
            const raw = (await wixGet(
                accessToken,
                `/stores/v1/products/${productId}/variants`,
                undefined,
                siteId
            )) as { variants?: Array<{ id?: string }> };
            for (const v of raw.variants || []) {
                if (v.id) ids.add(String(v.id));
            }
        }
    } catch {
        // product-level id only
    }
    return [...ids];
}

export async function fetchWixProductsByIds(
    accessToken: string,
    ids: string[],
    siteId?: string | null
): Promise<ProductSearchResult[]> {
    const unique = [...new Set(ids.map(String).filter(Boolean))].slice(0, 250);
    if (!unique.length) return [];

    const results: ProductSearchResult[] = [];
    for (const id of unique) {
        try {
            const product = await fetchWixProductRecord(accessToken, id, siteId);
            if (product?.id) {
                results.push({
                    id: String(product.id),
                    name: typeof product.name === 'string' ? product.name : 'Untitled',
                    sku:
                        typeof product.sku === 'string'
                            ? product.sku
                            : undefined,
                });
            }
        } catch {
            // skip missing products
        }
    }

    return results;
}

/** Load weight/dims for rate enrichment (best-effort). */
export async function fetchWixProductPhysicalMap(
    accessToken: string,
    productIds: string[],
    siteId?: string | null
): Promise<Record<string, WixProductPhysical>> {
    const unique = [...new Set(productIds.map(String).filter(Boolean))].slice(0, 100);
    const map: Record<string, WixProductPhysical> = {};

    await Promise.all(
        unique.map(async (id) => {
            try {
                const product = await fetchWixProductRecord(accessToken, id, siteId);
                if (product) {
                    map[id] = physicalFromWixProduct(id, product);
                }
            } catch {
                // leave missing - preflight will hide rates if still incomplete
            }
        })
    );

    return map;
}

export { STORES_CATALOG_APP };
