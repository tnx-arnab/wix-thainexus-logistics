import { OrderShipmentRecord, ShipmentSummary } from '../types/shipment.js';
import { getSupabase } from './client.js';

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
    const { data, error } = await getSupabase()
        .from('order_shipments')
        .select('data')
        .eq('id', rowId(instanceId, orderId))
        .maybeSingle();

    if (error) throw error;
    if (!data?.data) return null;

    return data.data as OrderShipmentRecord;
}

export async function saveOrderShipments(record: OrderShipmentRecord): Promise<void> {
    const orderId = String(record.orderId);
    const { error } = await getSupabase().from('order_shipments').upsert({
        id: rowId(record.instanceId, orderId),
        instance_id: record.instanceId,
        order_id: orderId,
        data: { ...record, orderId },
        created_at: record.createdAt || new Date().toISOString(),
    });

    if (error) throw error;
}

/** Flatten webhook-persisted shipment refs for dashboard fallback/merge. */
export async function listStoredOrderShipments(instanceId: string): Promise<ShipmentSummary[]> {
    const { data, error } = await getSupabase()
        .from('order_shipments')
        .select('data, created_at, order_id')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    const summaries: ShipmentSummary[] = [];
    const seen = new Set<string>();

    for (const row of data || []) {
        const record = row.data as OrderShipmentRecord;
        const createdAt =
            record.createdAt || (row.created_at as string | undefined) || undefined;

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
