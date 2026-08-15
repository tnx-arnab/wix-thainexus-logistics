import { OrderShipmentRecord, ShipmentSummary } from '../types/shipment.js';
import { all, first, parseJson, run, toJson } from './client.js';

function rowId(instanceId: string, orderId: string | number) {
    return `${instanceId}_${orderId}`;
}

/** True when every packed box has a saved Thai Nexus request number. */
export function isOrderShipmentRecordComplete(record: OrderShipmentRecord): boolean {
    if (record.complete === true) return true;
    if (record.complete === false) return false;

    const created = record.requestNumbers?.length ?? 0;
    const expected = record.expectedBoxCount ?? created;
    if (!expected) return created > 0;

    return created >= expected;
}

export async function hasOrderShipments(
    instanceId: string,
    orderId: string | number
): Promise<boolean> {
    const record = await getOrderShipments(instanceId, orderId);
    return record != null && isOrderShipmentRecordComplete(record);
}

export async function isOrderShipmentComplete(
    instanceId: string,
    orderId: string | number
): Promise<boolean> {
    return hasOrderShipments(instanceId, orderId);
}

export async function getOrderShipments(
    instanceId: string,
    orderId: string | number
): Promise<OrderShipmentRecord | null> {
    const row = await first<{ data: string }>('SELECT data FROM order_shipments WHERE id = ?', rowId(instanceId, orderId));
    if (!row?.data) return null;
    return parseJson<OrderShipmentRecord>(row.data);
}

export async function saveOrderShipments(record: OrderShipmentRecord): Promise<void> {
    const orderId = String(record.orderId);
    const createdAt = record.createdAt || new Date().toISOString();
    await run(
        `INSERT INTO order_shipments (id, instance_id, order_id, data, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           instance_id = excluded.instance_id,
           order_id = excluded.order_id,
           data = excluded.data,
           created_at = excluded.created_at`,
        rowId(record.instanceId, orderId),
        record.instanceId,
        orderId,
        toJson({ ...record, orderId }),
        createdAt
    );
}

/** Flatten webhook-persisted shipment refs for dashboard fallback/merge. */
export async function listStoredOrderShipments(instanceId: string): Promise<ShipmentSummary[]> {
    const rows = await all<{ data: string; created_at: string; order_id: string }>(
        `SELECT data, created_at, order_id FROM order_shipments
         WHERE instance_id = ?
         ORDER BY created_at DESC`,
        instanceId
    );

    const summaries: ShipmentSummary[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
        const record = parseJson<OrderShipmentRecord | null>(row.data, null);
        if (!record) continue;
        const createdAt = record.createdAt || row.created_at || undefined;

        for (const shipment of record.shipments || []) {
            if (!shipment.request_number || seen.has(shipment.request_number)) continue;
            seen.add(shipment.request_number);
            summaries.push({
                request_number: shipment.request_number,
                status: shipment.status,
                created_at: createdAt,
            });
        }

        for (const requestNumber of record.requestNumbers || []) {
            if (!requestNumber || seen.has(requestNumber)) continue;
            seen.add(requestNumber);
            summaries.push({
                request_number: requestNumber,
                created_at: createdAt,
            });
        }
    }

    return summaries;
}
