import type { ShipmentLineItem } from '../types/shipment.js';
import { normalizeHsCode } from '../hsCode.js';

export const HS_CODE_FALLBACK = '999999';

export const MIN_DECLARED_VALUE = 0.01;

export function ensureMinimumDeclaredValue(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return MIN_DECLARED_VALUE;
    return Math.max(Math.round(n * 100) / 100, MIN_DECLARED_VALUE);
}

/** API requires at least 3 characters. */
export function normalizeShipmentItemDescription(description: string): string {
    const base = String(description || '').trim() || 'Item';
    if (base.length >= 3) return base;
    return base.padEnd(3, '.');
}

export function sanitizeShipmentItemsForApi(items: ShipmentLineItem[]): ShipmentLineItem[] {
    return items.map((row) => {
        const hs = normalizeHsCode(row.hs_code) || HS_CODE_FALLBACK;
        return {
            ...row,
            description: normalizeShipmentItemDescription(row.description),
            declared_value: ensureMinimumDeclaredValue(row.declared_value),
            hs_code: hs,
            country_of_origin: (row.country_of_origin || 'TH').trim().toUpperCase() || 'TH',
        };
    });
}

export function validateShipmentItemsForCreate(items: ShipmentLineItem[]): string | null {
    if (!items.length) return 'At least one shipment item is required';

    for (let i = 0; i < items.length; i += 1) {
        const row = items[i];
        const desc = normalizeShipmentItemDescription(row.description);
        if (desc.length < 3) {
            return `shipment_items[${i}].description must be at least 3 characters`;
        }
        if (!Number.isFinite(row.declared_value) || row.declared_value <= 0) {
            return `shipment_items[${i}].declared_value must be above 0`;
        }
        if (!normalizeHsCode(row.hs_code)) {
            return `shipment_items[${i}].hs_code is required`;
        }
    }

    return null;
}

export function toApiShipmentItemRows(
    items: ShipmentLineItem[]
): Array<{
    description: string;
    quantity: number;
    declared_value: number;
    hs_code: string;
    country_of_origin: string;
}> {
    return items.map((row) => ({
        description: row.description,
        quantity: Math.max(1, Math.floor(row.quantity) || 1),
        declared_value: row.declared_value,
        hs_code: row.hs_code || HS_CODE_FALLBACK,
        country_of_origin: (row.country_of_origin || 'TH').trim().toUpperCase() || 'TH',
    }));
}
