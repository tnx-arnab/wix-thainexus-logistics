import {
    findOrderShipmentByRequestNumber,
    listInstanceIds,
    listStoredOrderShipments,
    pickTrackingRequestNumbers,
    syncShipmentTracking,
} from '@thai-nexus/shared';
import { backfillAllStoresSelectedShipping } from './wix/backfillShipping.js';
import { getValidAccessToken } from './wix/tokens.js';
import { pushTrackingToWixOrder } from './wix/trackingPush.js';

export async function runHourlyTrackingSync(): Promise<{ stores: number; synced: number }> {
    await backfillAllStoresSelectedShipping().catch((err) => {
        console.warn(
            '[shipping-backfill]',
            err instanceof Error ? err.message : err
        );
    });

    const instanceIds = await listInstanceIds();
    let synced = 0;

    for (const instanceId of instanceIds) {
        const rows = await listStoredOrderShipments(instanceId);
        const requestNumbers = pickTrackingRequestNumbers(
            rows.map((row) => ({
                request_number: row.request_number,
                status: row.status,
                tnx_tracking_number: String(row.data?.tnx_tracking_number || ''),
            }))
        );
        const accessToken = await getValidAccessToken(instanceId);

        for (const requestNumber of requestNumbers) {
            try {
                const result = await syncShipmentTracking(instanceId, requestNumber);
                synced += 1;
                const tnx = result.shipment.tnx_tracking_number;
                const url = result.shipment.tracking_url || '';
                if (tnx && result.orderId && accessToken) {
                    const record = await findOrderShipmentByRequestNumber(
                        instanceId,
                        requestNumber
                    );
                    const numbers = record?.requestNumbers || [requestNumber];
                    const parcelIndex = Math.max(0, numbers.indexOf(requestNumber));
                    await pushTrackingToWixOrder(
                        accessToken,
                        result.orderId,
                        tnx,
                        url,
                        { parcelIndex, parcelCount: Math.max(1, numbers.length) }
                    ).catch(() => undefined);
                }
            } catch {
                // Keep the hourly batch moving if one shipment fails.
            }
        }
    }

    return { stores: instanceIds.length, synced };
}
