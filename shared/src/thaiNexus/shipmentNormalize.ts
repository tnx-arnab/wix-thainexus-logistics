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
        submitted_date: pickString(r, 'submitted_date', 'submittedDate') || undefined,
        created_at: pickString(r, 'created_at', 'createdAt', 'submitted_date', 'submittedDate') || undefined,
        data: r,
    };
}

export function normalizeShipmentDetail(payload: unknown): ShipmentDetail {
    const row = asRecord(payload) || {};
    const summary = normalizeShipmentSummary(row);

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

export function mergeShipmentSummaries(
    primary: ShipmentSummary[],
    secondary: ShipmentSummary[]
): ShipmentSummary[] {
    const merged = new Map<string, ShipmentSummary>();

    for (const row of [...primary, ...secondary]) {
        if (!row.request_number) continue;
        const existing = merged.get(row.request_number);
        merged.set(row.request_number, existing ? { ...existing, ...row } : row);
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
