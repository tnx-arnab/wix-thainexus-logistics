import { ShipmentDetail, ShipmentListResponse, ShipmentSummary } from '../types/shipment.js';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
        const value = row[key];
        if (value != null && String(value).trim()) {
            return String(value).trim();
        }
    }

    return '';
}

/** Chargeable weight is the greater of actual and volumetric, matching Thai Nexus pricing. */
export function chargeableWeightKg(
    actual?: number,
    volumetric?: number,
    stored?: number
): number | undefined {
    if (stored != null && Number.isFinite(stored) && stored > 0) {
        return Math.round(stored * 1000) / 1000;
    }
    if (actual == null && volumetric == null) return undefined;
    const weight = Math.max(actual ?? 0, volumetric ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) return undefined;
    return Math.round(weight * 1000) / 1000;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const key of keys) {
        const value = row[key];
        if (value == null || value === '') continue;
        const n = typeof value === 'number' ? value : parseFloat(String(value));
        if (Number.isFinite(n)) return n;
    }

    return undefined;
}

export function normalizeShipmentSummary(row: unknown): ShipmentSummary {
    const r = asRecord(row) || {};

    return {
        request_number: pickString(r, 'request_number', 'requestNumber', 'request_no'),
        status: pickString(r, 'status', 'shipment_status') || undefined,
        volumetric_weight_kg: pickNumber(
            r,
            'volumetric_weight_kg',
            'volumetricWeightKg',
            'volumetric_weight'
        ),
        actual_weight_kg: pickNumber(r, 'actual_weight_kg', 'actualWeightKg', 'weight_kg'),
        chargeable_weight_kg: chargeableWeightKg(
            pickNumber(r, 'actual_weight_kg', 'actualWeightKg', 'weight_kg'),
            pickNumber(r, 'volumetric_weight_kg', 'volumetricWeightKg', 'volumetric_weight'),
            pickNumber(r, 'gross_weight_kg', 'grossWeightKg', 'chargeable_weight_kg')
        ),
        submitted_date: pickString(r, 'submitted_date', 'submittedDate') || undefined,
        created_at: pickString(r, 'created_at', 'createdAt', 'submitted_date', 'submittedDate') || undefined,
        data: r,
    };
}

export function extractTnxCode(row: unknown): string {
    const record = asRecord(row);
    if (!record) return '';

    const sources = [record, asRecord(record.data)].filter(Boolean) as Record<string, unknown>[];
    const keys = [
        'tnx_tracking_number',
        'customer_tracking_code',
        'tnx_tracking_code',
        'tnx_code',
        'tracking_number',
    ];

    for (const source of sources) {
        for (const key of keys) {
            const candidate = String(source[key] ?? '').trim().toUpperCase();
            if (/^TNX[A-Z0-9]+$/.test(candidate)) return candidate;
        }
    }

    return '';
}

export const TRACKING_BASE = 'https://tracking.thainexus.co.th/track/';

export function trackingUrlFor(tnx: string): string {
    const code = tnx.trim().toUpperCase();
    return code ? `${TRACKING_BASE}${encodeURIComponent(code)}` : '';
}

export function normalizeShipmentDetail(payload: unknown): ShipmentDetail {
    const row = asRecord(payload) || {};
    const summary = normalizeShipmentSummary(row);
    const nested = asRecord(row.data) || {};
    const tnx = extractTnxCode({ ...nested, ...row });

    return {
        ...summary,
        shipper_address: asRecord(row.shipper_address) || asRecord(row.shipperAddress) || undefined,
        consignee_address:
            asRecord(row.consignee_address) || asRecord(row.consigneeAddress) || undefined,
        actual_weight_kg: pickNumber(row, 'actual_weight_kg', 'actualWeightKg', 'weight_kg'),
        length_cm: pickNumber(row, 'length_cm', 'lengthCm'),
        width_cm: pickNumber(row, 'width_cm', 'widthCm'),
        height_cm: pickNumber(row, 'height_cm', 'heightCm'),
        shipment_description:
            pickString(row, 'shipment_description', 'shipmentDescription', 'description') ||
            undefined,
        tnx_tracking_number: tnx || undefined,
        tracking_url: tnx ? trackingUrlFor(tnx) : undefined,
        data: row,
    };
}

export function extractShipmentRows(raw: Record<string, unknown>): unknown[] {
    const payload = raw.data;

    if (Array.isArray(payload)) {
        return payload;
    }

    const nested = asRecord(payload);
    if (nested) {
        for (const key of ['shipments', 'data', 'items', 'results', 'records']) {
            if (Array.isArray(nested[key])) {
                return nested[key] as unknown[];
            }
        }
    }

    for (const key of ['shipments', 'items', 'results', 'records']) {
        if (Array.isArray(raw[key])) {
            return raw[key] as unknown[];
        }
    }

    return [];
}

export function normalizeShipmentListResponse(raw: Record<string, unknown>): ShipmentListResponse {
    if (raw.success === false) {
        throw new Error(
            pickString(raw, 'error', 'message') || 'Thai Nexus shipment list failed'
        );
    }

    const rows = extractShipmentRows(raw);
    const data = rows.map(normalizeShipmentSummary).filter((row) => row.request_number);

    const payload = asRecord(raw.data);
    const pagination = asRecord(raw.pagination) || asRecord(payload?.pagination) || {};
    const total =
        pickNumber(pagination, 'total') ??
        pickNumber(raw, 'total') ??
        pickNumber(payload || {}, 'total') ??
        data.length;

    return {
        data,
        pagination: {
            total,
            page: pickNumber(pagination, 'page') ?? pickNumber(raw, 'page'),
            limit: pickNumber(pagination, 'limit') ?? pickNumber(raw, 'limit'),
        },
        total,
    };
}

function withoutEmpty(row: ShipmentSummary): ShipmentSummary {
    const next: ShipmentSummary = { ...row };
    for (const key of Object.keys(next) as (keyof ShipmentSummary)[]) {
        if (next[key] === undefined || next[key] === '') delete next[key];
    }
    return next;
}

/**
 * Live Thai Nexus rows win for shipment status. Local rows keep payment fields
 * the public list does not return.
 */
export function mergeShipmentSummaries(
    upstream: ShipmentSummary[],
    local: ShipmentSummary[]
): ShipmentSummary[] {
    const merged = new Map<string, ShipmentSummary>();

    for (const row of local) {
        if (!row.request_number) continue;
        merged.set(row.request_number, withoutEmpty(row));
    }

    for (const row of upstream) {
        if (!row.request_number) continue;
        const existing = merged.get(row.request_number);
        const live = withoutEmpty(row);
        if (!existing) {
            merged.set(row.request_number, live);
            continue;
        }
        merged.set(row.request_number, {
            ...existing,
            ...live,
            status: live.status || existing.status,
            api_price_thb: existing.api_price_thb ?? live.api_price_thb,
            payment_status: existing.payment_status || live.payment_status,
            created_at: existing.created_at || live.created_at || live.submitted_date,
        });
    }

    return [...merged.values()].sort((a, b) => {
        const aTime = Date.parse(a.created_at || a.submitted_date || '') || 0;
        const bTime = Date.parse(b.created_at || b.submitted_date || '') || 0;

        return bTime - aTime;
    });
}

export function paginateShipmentSummaries(
    rows: ShipmentSummary[],
    page: number,
    limit: number
): ShipmentListResponse {
    const total = rows.length;
    const start = (page - 1) * limit;

    return {
        data: rows.slice(start, start + limit),
        pagination: { total, page, limit },
        total,
    };
}
