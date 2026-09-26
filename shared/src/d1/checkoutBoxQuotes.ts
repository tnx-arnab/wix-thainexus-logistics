import { coverageIds } from '../serviceCoverage.js';
import { all, first, run, toJson, parseJson } from './client.js';

export interface CheckoutBoxQuoteBox {
    index: number;
    length: number;
    width: number;
    height: number;
    weight: number;
    isDocument: boolean;
    /** Courier aliases -> raw final_price_thb for this box only. */
    pricesThb: Record<string, number>;
}

export interface CheckoutBoxQuoteSnapshot {
    country: string;
    postcode: string;
    city: string;
    boxes: CheckoutBoxQuoteBox[];
}

function round3(n: number): number {
    return Math.round((Number(n) || 0) * 1000) / 1000;
}

function normalizePostcode(value: string | undefined): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '');
}

export function checkoutQuoteFingerprint(input: {
    country?: string;
    postcode?: string;
    city?: string;
    boxes: Array<{
        length: number;
        width: number;
        height: number;
        weight: number;
        isDocument?: boolean;
    }>;
}): string {
    const boxes = input.boxes
        .map(
            (box) =>
                `${round3(box.length)}x${round3(box.width)}x${round3(box.height)}@${round3(box.weight)}:${box.isDocument ? 1 : 0}`
        )
        .join(';');

    return [
        String(input.country || '').trim().toUpperCase(),
        normalizePostcode(input.postcode),
        String(input.city || '').trim().toLowerCase(),
        boxes,
    ].join('|');
}

/** Raw THB for the courier the shopper selected. Never a marked-up checkout total. */
export function rawPriceForService(
    prices: Record<string, number> | undefined,
    serviceId?: string,
    extraLabels: Array<string | undefined> = []
): number | null {
    if (!prices) return null;
    const labels = [serviceId, ...extraLabels].map((value) => value?.trim()).filter(Boolean) as string[];
    if (!labels.length) return null;

    const want = new Set(labels.flatMap((label) => coverageIds(label)));
    let fallback: number | null = null;
    for (const label of labels) {
        const exact = prices[label];
        if (Number.isFinite(exact) && exact > 0) return Math.round(exact * 100) / 100;
    }
    for (const [key, value] of Object.entries(prices)) {
        if (!want.has(key)) continue;
        if (!Number.isFinite(value) || value <= 0) continue;
        fallback = Math.round(value * 100) / 100;
        break;
    }
    return fallback;
}

function newQuoteId(instanceId: string, fingerprint: string): string {
    return `${instanceId}:${fingerprint}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveCheckoutBoxQuotes(
    instanceId: string,
    snapshot: CheckoutBoxQuoteSnapshot
): Promise<void> {
    const fingerprint = checkoutQuoteFingerprint(snapshot);
    const createdAt = new Date().toISOString();
    await run(
        `INSERT INTO checkout_box_quotes (id, instance_id, fingerprint, data, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        newQuoteId(instanceId, fingerprint),
        instanceId,
        fingerprint,
        toJson({ ...snapshot, consumed: false }),
        createdAt
    );
}

export async function consumeCheckoutBoxQuote(id: string): Promise<void> {
    const row = await first<{ data: string }>('SELECT data FROM checkout_box_quotes WHERE id = ?', id);
    if (!row?.data) return;
    const data = parseJson<CheckoutBoxQuoteSnapshot & { consumed?: boolean }>(row.data, null as never);
    if (!data || data.consumed) return;
    await run(
        'UPDATE checkout_box_quotes SET data = ? WHERE id = ?',
        toJson({ ...data, consumed: true }),
        id
    );
}

export async function findCheckoutBoxQuotes(
    instanceId: string,
    parcel: {
        country?: string;
        postcode?: string;
        city?: string;
        boxes: Array<{
        length: number;
        width: number;
        height: number;
        weight: number;
        isDocument?: boolean;
    }>;
    }
): Promise<(CheckoutBoxQuoteSnapshot & { id: string }) | null> {
    const fingerprint = checkoutQuoteFingerprint(parcel);
    const rows = await all<{ id: string; data: string }>(
        `SELECT id, data FROM checkout_box_quotes
         WHERE instance_id = ? AND fingerprint = ?
         ORDER BY created_at ASC`,
        instanceId,
        fingerprint
    );
    for (const row of rows) {
        const data = parseJson<(CheckoutBoxQuoteSnapshot & { consumed?: boolean }) | null>(row.data, null);
        if (!data || data.consumed) continue;
        return { ...data, id: row.id };
    }
    return null;
}
