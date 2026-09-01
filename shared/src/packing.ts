/**
 * Box packing for Thai Nexus rate quotes and shipment creation.
 *
 * Algorithm (see packItems):
 *  1. Every BC line item is expanded into single units (qty 3 → 3 units) with
 *     dimensions/weight normalized to cm/kg (BC may send strings and any unit).
 *  2. Configured boxes are tried SMALLEST-VOLUME-FIRST; a unit fits a box if
 *     its sorted dims fit the box's sorted dims (rotation allowed).
 *  3. A box must satisfy: per-unit dimensional fit, combined weight (incl. the
 *     box's empty weight) ≤ max weight, combined unit volume ≤ box volume.
 *  4. If one box can hold everything remaining, the smallest such box is used.
 *     Otherwise the largest remaining unit anchors the smallest box that fits
 *     it, other units fill in greedily, and the process repeats per parcel.
 *
 * Output contract: each PackedBox reports the CHOSEN BOX's inner dimensions
 * and total weight (contents + empty box) - the exact values quoted to the
 * courier and used for shipment creation, since the courier handles the box,
 * not the bare items.
 */
import { BcRateItem, ShippingBox } from './types/thaiNexus.js';
import type { ShipmentLineItem } from './types/shipment.js';

/** One physical unit to pack (a single quantity of a product), in cm/kg. */
export interface PackUnit {
    l: number;
    w: number;
    h: number;
    kg: number;
    name: string;
    productId?: string;
    isDocument: boolean;
    declaredValue: number;
    currency: string;
    hsCode: string;
    origin: string;
}

export type PackItemsOptions = {
    /** Per-product retail-box flag (`thai_nexus.is_boxed_product`). */
    boxedProductFlags?: Record<string, boolean>;
};

const RETAIL_BOX_ID = 'retail_box';
const RETAIL_BOX_NAME = 'Retail box';

/** True when the cart is a single product flagged as boxed (retail-dimension quoting). */
export function cartQualifiesForRetailBoxing(
    items: BcRateItem[],
    boxedProductFlags: Record<string, boolean>
): boolean {
    if (!items.length) return false;

    const productIds = new Set<string>();
    for (const item of items) {
        const productId = item.product_id ? String(item.product_id) : '';
        if (productId) productIds.add(productId);
    }

    if (productIds.size !== 1) return false;

    return Boolean(boxedProductFlags[[...productIds][0]]);
}

/**
 * One parcel produced by the packer.
 *
 * CONTRACT: `length`/`width`/`height` are the INNER DIMENSIONS OF THE CHOSEN
 * BOX and `weight` is contents + box empty weight. These are the values sent
 * to Thai Nexus for BOTH rate quotes (`apiQuote.length_cm/...`) and shipment
 * creation (`shipmentCrud.length_cm/...`), because the parcel the courier
 * physically handles is the box itself - quoting anything smaller (e.g. the
 * contents' bounding size) under-reports volumetric weight.
 */
export interface PackedBox {
    /** Parcel dimensions = inner dims of the chosen box (cm). Sent upstream. */
    length: number;
    width: number;
    height: number;
    /** Total shipment weight: contents + box empty weight (kg). Sent upstream. */
    weight: number;
    /** True if any packed item is flagged as a document. */
    isDocument: boolean;
    /** Configured box that was selected. */
    boxId: string;
    boxName: string;
    /** Bounding dims of the packed contents (cm) - diagnostics only, never quoted. */
    contents: { length: number; width: number; height: number };
    /** Item labels packed into this box, e.g. "Shoe box ×2". */
    items: string[];
    /** Customs lines for Thai Nexus shipment_items. */
    shipmentItems: ShipmentLineItem[];
}

const DEFAULT_BOX: ShippingBox = {
    id: 'default',
    name: 'Default',
    innerLengthCm: 40,
    innerWidthCm: 30,
    innerDepthCm: 20,
    maxWeightKg: 30,
    emptyWeightKg: 0.2,
};

/**
 * BigCommerce sends numeric fields as strings ("1.5000"). Without coercion the
 * packing math silently degrades: weights concatenate ("0" + "1.5" = "01.5"),
 * multi-item sums become NaN (forcing one box per item and inflating rates),
 * and string<=string dimension checks compare alphabetically.
 */
function toNum(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : undefined;
}

function toCm(dim?: { units?: string; value?: number | string }, fallback = 10): number {
    const value = toNum(dim?.value);
    if (!value) return fallback;
    const u = (dim?.units || 'cm').toLowerCase();

    if (u === 'in' || u === 'inch' || u === 'inches') return value * 2.54;
    if (u === 'm') return value * 100;

    return value;
}

function toKg(dim?: { units?: string; value?: number | string }, fallback = 0.5): number {
    const value = toNum(dim?.value);
    if (!value) return fallback;
    const u = (dim?.units || 'kg').toLowerCase();

    if (u === 'g' || u === 'gram' || u === 'grams') return value / 1000;
    if (u === 'lb' || u === 'pound' || u === 'pounds') return value * 0.453592;
    if (u === 'oz' || u === 'ounce' || u === 'ounces') return value * 0.0283495;

    return value;
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** Box configs saved via the admin form can also carry string numbers. */
function normalizeBox(box: ShippingBox): ShippingBox {
    return {
        ...box,
        innerLengthCm: toNum(box.innerLengthCm) ?? 0,
        innerWidthCm: toNum(box.innerWidthCm) ?? 0,
        innerDepthCm: toNum(box.innerDepthCm) ?? 0,
        maxWeightKg: toNum(box.maxWeightKg) ?? 0,
        emptyWeightKg: toNum(box.emptyWeightKg) ?? 0,
    };
}

/** Summarize packed units as "Name ×qty" labels. */
function itemLabels(packed: PackUnit[]): string[] {
    const counts = new Map<string, number>();
    for (const u of packed) {
        counts.set(u.name, (counts.get(u.name) ?? 0) + 1);
    }

    return [...counts.entries()].map(([name, qty]) => (qty > 1 ? `${name} ×${qty}` : name));
}

function unitDeclaredValue(item: BcRateItem): number {
    const n = parseFloat(item.discounted_price?.amount || '0');
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function unitCurrency(item: BcRateItem): string {
    return (item.discounted_price?.currency || 'THB').toUpperCase();
}

function unitOrigin(item: BcRateItem): string {
    const raw = (item.country_of_origin || 'TH').trim().toUpperCase();
    return raw || 'TH';
}

export function shipmentItemsFromUnits(packed: PackUnit[]): ShipmentLineItem[] {
    const grouped = new Map<string, ShipmentLineItem>();
    for (const u of packed) {
        const description = u.name.trim() || 'Item';
        const hs_code = u.hsCode.trim();
        const country_of_origin = u.origin.trim() || 'TH';
        const declared_value = u.declaredValue;
        const currency_code = u.currency || 'THB';
        const key = `${description}|${hs_code}|${country_of_origin}|${declared_value}|${currency_code}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.quantity += 1;
            continue;
        }
        grouped.set(key, {
            description,
            quantity: 1,
            declared_value,
            currency_code,
            ...(hs_code ? { hs_code } : {}),
            country_of_origin,
        });
    }
    return [...grouped.values()];
}

export function totalDeclaredValue(items: ShipmentLineItem[]): number {
    return Math.round(
        items.reduce((sum, item) => sum + item.declared_value * item.quantity, 0) * 100
    ) / 100;
}

/** Dimensions sorted largest-first, so fit checks allow any rotation. */
function sortedDims(l: number, w: number, h: number): [number, number, number] {
    const d = [l, w, h].sort((a, b) => b - a);
    return [d[0], d[1], d[2]];
}

function boxDims(box: ShippingBox): [number, number, number] {
    return sortedDims(box.innerLengthCm, box.innerWidthCm, box.innerDepthCm);
}

/** Rotation-aware: a unit fits if its sorted dims fit the box's sorted dims. */
function unitFitsBox(u: PackUnit, box: ShippingBox): boolean {
    const ud = sortedDims(u.l, u.w, u.h);
    const bd = boxDims(box);
    return ud[0] <= bd[0] && ud[1] <= bd[1] && ud[2] <= bd[2];
}

function unitVolume(u: PackUnit): number {
    return u.l * u.w * u.h;
}

function boxVolume(box: ShippingBox): number {
    return box.innerLengthCm * box.innerWidthCm * box.innerDepthCm;
}

function totalKg(units: PackUnit[]): number {
    return units.reduce((s, u) => s + u.kg, 0);
}

function totalVolume(units: PackUnit[]): number {
    return units.reduce((s, u) => s + unitVolume(u), 0);
}

/** Can this box hold ALL the given units (dims per unit, combined weight + volume)? */
function boxHoldsAll(box: ShippingBox, units: PackUnit[]): boolean {
    return (
        units.every((u) => unitFitsBox(u, box)) &&
        totalKg(units) + box.emptyWeightKg <= box.maxWeightKg &&
        totalVolume(units) <= boxVolume(box)
    );
}

function buildPackedBox(box: ShippingBox, packed: PackUnit[]): PackedBox {
    // Contents bounding (largest-first per axis, rotation-normalized, capped at
    // the box). Diagnostics only - couriers are quoted the BOX dimensions below.
    const bd = boxDims(box);
    const contents = [0, 1, 2].map((i) =>
        Math.min(Math.max(...packed.map((p) => sortedDims(p.l, p.w, p.h)[i])), bd[i])
    );

    return {
        // Parcel = the box itself; these dims drive volumetric weight upstream.
        length: round3(box.innerLengthCm),
        width: round3(box.innerWidthCm),
        height: round3(box.innerDepthCm),
        weight: round3(totalKg(packed) + box.emptyWeightKg),
        isDocument: packed.some((p) => p.isDocument),
        boxId: box.id,
        boxName: box.name,
        contents: {
            length: round3(contents[0]),
            width: round3(contents[1]),
            height: round3(contents[2]),
        },
        items: itemLabels(packed),
        shipmentItems: shipmentItemsFromUnits(packed),
    };
}

function buildRetailPackedBox(
    l: number,
    w: number,
    h: number,
    kg: number,
    name: string,
    isDocument: boolean,
    declaredValue: number,
    currency: string,
    hsCode: string,
    origin: string
): PackedBox {
    const unit: PackUnit = {
        l,
        w,
        h,
        kg,
        name,
        isDocument,
        declaredValue,
        currency,
        hsCode,
        origin,
    };
    return {
        length: round3(l),
        width: round3(w),
        height: round3(h),
        weight: round3(kg),
        isDocument,
        boxId: RETAIL_BOX_ID,
        boxName: RETAIL_BOX_NAME,
        contents: { length: round3(l), width: round3(w), height: round3(h) },
        items: [name],
        shipmentItems: shipmentItemsFromUnits([unit]),
    };
}

/**
 * When the cart contains only one product (one or more line items for the same
 * product_id) and that product is flagged as boxed, quote each unit using the
 * product's own dimensions (retail packaging) instead of merchant packing boxes.
 * Returns null when normal packing should apply.
 */
export function packBoxedSingleItemCart(
    items: BcRateItem[],
    documentFlags: Record<string, boolean>,
    boxedProductFlags: Record<string, boolean>
): { boxes: PackedBox[]; errors: string[] } | null {
    if (!items.length) return null;

    const productIds = new Set<string>();
    for (const item of items) {
        const productId = item.product_id ? String(item.product_id) : '';
        if (productId) productIds.add(productId);
    }

    if (productIds.size !== 1) return null;

    const productId = [...productIds][0];
    if (!boxedProductFlags[productId]) return null;

    const boxes: PackedBox[] = [];
    const errors: string[] = [];

    for (const item of items) {
        const lengthVal = toNum(item.length?.value);
        const widthVal = toNum(item.width?.value);
        const heightVal = toNum(item.height?.value);
        const weightVal = toNum(item.weight?.value);

        if (!lengthVal || !widthVal || !heightVal || !weightVal) {
            errors.push(
                `"${item.name || 'Product'}" is a boxed product - set weight and dimensions on the product before quoting.`
            );
            continue;
        }

        const l = toCm(item.length);
        const w = toCm(item.width);
        const h = toCm(item.height);
        const kg = toKg(item.weight);
        const qty = Math.max(1, Math.round(toNum(item.quantity) ?? 1));
        const name = item.name?.trim() || 'Item';
        const isDocument = Boolean(documentFlags[productId]);
        const declaredValue = unitDeclaredValue(item);
        const currency = unitCurrency(item);
        const hsCode = (item.hs_code || '').trim();
        const origin = unitOrigin(item);

        for (let i = 0; i < qty; i++) {
            boxes.push(
                buildRetailPackedBox(
                    l,
                    w,
                    h,
                    kg,
                    name,
                    isDocument,
                    declaredValue,
                    currency,
                    hsCode,
                    origin
                )
            );
        }
    }

    if (errors.length) {
        return { boxes: [], errors };
    }

    if (!boxes.length) {
        return null;
    }

    return { boxes, errors: [] };
}

/**
 * Smart box packing:
 * - Boxes are tried smallest-volume-first; each parcel uses the SMALLEST box
 *   that fits (not just the first configured box).
 * - Items may be rotated (sorted-dimension fit check).
 * - A box must satisfy per-item dimensions, combined weight, and combined volume.
 * - Items too big/heavy for every box produce a packing error.
 */
export function packItems(
    items: BcRateItem[],
    boxes: ShippingBox[],
    documentFlags: Record<string, boolean> = {},
    options: PackItemsOptions = {}
): { boxes: PackedBox[]; errors: string[] } {
    const boxed = packBoxedSingleItemCart(
        items,
        documentFlags,
        options.boxedProductFlags || {}
    );
    if (boxed) return boxed;

    const inventory = (boxes.length ? boxes : [DEFAULT_BOX])
        .map(normalizeBox)
        .filter((b) => boxVolume(b) > 0 && b.maxWeightKg > 0)
        .sort((a, b) => boxVolume(a) - boxVolume(b));
    const errors: string[] = [];
    const result: PackedBox[] = [];

    if (!inventory.length) {
        return { boxes: [], errors: ['No usable boxes configured'] };
    }

    const units: PackUnit[] = [];
    items.forEach((item, idx) => {
        const qty = Math.max(1, Math.round(toNum(item.quantity) ?? 1));
        const l = toCm(item.length);
        const w = toCm(item.width);
        const h = toCm(item.height);
        const kg = toKg(item.weight);
        const name = item.name?.trim() || `Item ${idx + 1}`;
        const productId = item.product_id ? String(item.product_id) : undefined;
        const isDocument = productId ? Boolean(documentFlags[productId]) : false;
        const declaredValue = unitDeclaredValue(item);
        const currency = unitCurrency(item);
        const hsCode = (item.hs_code || '').trim();
        const origin = unitOrigin(item);

        for (let i = 0; i < qty; i++) {
            units.push({
                l,
                w,
                h,
                kg,
                name,
                productId,
                isDocument,
                declaredValue,
                currency,
                hsCode,
                origin,
            });
        }
        if (!toNum(item.length?.value)) {
            errors.push(`Item ${idx + 1} missing dimensions - using defaults`);
        }
    });

    if (!units.length) {
        return { boxes: [], errors: ['No shippable items'] };
    }

    // Pack big/heavy items first so they anchor boxes and small items fill gaps.
    let remaining = [...units].sort(
        (a, b) => unitVolume(b) - unitVolume(a) || b.kg - a.kg
    );

    while (remaining.length) {
        // Best case: one box (the smallest possible) holds everything left.
        const boxForAll = inventory.find((box) => boxHoldsAll(box, remaining));
        if (boxForAll) {
            result.push(buildPackedBox(boxForAll, remaining));
            remaining = [];
            break;
        }

        // Otherwise anchor the largest remaining item in the smallest box that
        // fits it, then greedily add whatever else fits.
        const anchor = remaining[0];
        const box = inventory.find((b) => boxHoldsAll(b, [anchor]));
        if (!box) {
            errors.push(
                `"${anchor.name}" (${round3(anchor.l)}×${round3(anchor.w)}×${round3(anchor.h)} cm, ${round3(anchor.kg)} kg) does not fit any configured box`
            );
            break;
        }

        const packed: PackUnit[] = [anchor];
        const rest: PackUnit[] = [];
        for (const u of remaining.slice(1)) {
            if (boxHoldsAll(box, [...packed, u])) packed.push(u);
            else rest.push(u);
        }

        result.push(buildPackedBox(box, packed));
        remaining = rest;
    }

    if (remaining.length > 0) {
        errors.push(
            `${remaining.length} item(s) could not be packed into configured boxes`
        );
        return { boxes: [], errors };
    }

    return { boxes: result, errors };
}
