import {
    listInstanceIds,
    listOrderShipmentRecords,
    saveOrderShipments,
} from '@thai-nexus/shared';
import { getEcomOrder } from './ordersApi.js';
import { getValidAccessToken } from './tokens.js';
import {
    applySelectedShipping,
    extractSelectedShipping,
    selectedShippingMissing,
} from './orderWebhook.js';

const INSTANCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pull selected checkout shipping from Wix onto order_shipments rows that never stored it. */
export async function backfillMissingSelectedShipping(
    instanceId: string,
    options: { limit?: number } = {}
): Promise<{ scanned: number; updated: number }> {
    const limit = options.limit ?? 40;
    const records = await listOrderShipmentRecords(instanceId);
    const missing = records.filter(selectedShippingMissing);
    if (!missing.length) return { scanned: 0, updated: 0 };

    const accessToken = await getValidAccessToken(instanceId);
    if (!accessToken) return { scanned: missing.length, updated: 0 };

    let updated = 0;
    for (const record of missing.slice(0, limit)) {
        const orderId = String(record.orderId || '').trim();
        if (!orderId) continue;
        try {
            const order = await getEcomOrder(accessToken, orderId);
            if (!order) continue;
            const selected = extractSelectedShipping({ order });
            if (selectedShippingMissing(selected)) continue;
            await saveOrderShipments(applySelectedShipping(record, selected));
            updated += 1;
        } catch (err) {
            console.warn(
                '[shipping-backfill]',
                instanceId,
                orderId,
                err instanceof Error ? err.message : err
            );
        }
    }

    return { scanned: missing.length, updated };
}

export async function backfillAllStoresSelectedShipping(
    limitPerStore = 40
): Promise<{ stores: number; updated: number }> {
    const instanceIds = (await listInstanceIds()).filter((id) => INSTANCE_UUID_RE.test(id));
    let updated = 0;
    for (const instanceId of instanceIds) {
        const result = await backfillMissingSelectedShipping(instanceId, { limit: limitPerStore });
        updated += result.updated;
    }
    return { stores: instanceIds.length, updated };
}
