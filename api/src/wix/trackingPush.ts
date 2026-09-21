import { getEcomOrder } from './ordersApi.js';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function lineItemsFromOrder(order: Record<string, unknown>): Array<{ id: string; quantity: number }> {
    const lines = (order.lineItems || order.line_items) as unknown;
    if (!Array.isArray(lines)) return [];

    return lines
        .map((line) => {
            const row = asRecord(line);
            if (!row) return null;
            const id = String(row.id || '').trim();
            const quantity = Number(row.quantity) || 1;
            if (!id) return null;
            return { id, quantity };
        })
        .filter((row): row is { id: string; quantity: number } => Boolean(row));
}

function existingTrackingNumbers(order: Record<string, unknown>): string[] {
    const fulfillments = order.fulfillments;
    if (!Array.isArray(fulfillments)) return [];
    const codes: string[] = [];
    for (const row of fulfillments) {
        const rec = asRecord(row);
        const tracking = asRecord(rec?.trackingInfo) || asRecord(rec?.tracking_info);
        const number = String(tracking?.trackingNumber || tracking?.tracking_number || '').trim();
        if (number) codes.push(number.toUpperCase());
    }
    return codes;
}

function fulfilledQtyByLine(order: Record<string, unknown>): Map<string, number> {
    const fulfilled = new Map<string, number>();
    const fulfillments = order.fulfillments;
    if (!Array.isArray(fulfillments)) return fulfilled;

    for (const row of fulfillments) {
        const rec = asRecord(row);
        const lines = rec?.lineItems || rec?.line_items;
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
            const item = asRecord(line);
            const id = String(item?.id || item?.lineItemId || '').trim();
            const qty = Number(item?.quantity) || 0;
            if (!id || qty <= 0) continue;
            fulfilled.set(id, (fulfilled.get(id) || 0) + qty);
        }
    }

    return fulfilled;
}

function splitQty(total: number, parcelIndex: number, parcelCount: number): number {
    if (parcelCount <= 1) return total;
    const base = Math.floor(total / parcelCount);
    const extra = total % parcelCount;
    return base + (parcelIndex < extra ? 1 : 0);
}

export async function pushTrackingToWixOrder(
    accessToken: string,
    orderId: string,
    trackingNumber: string,
    trackingUrl: string,
    split?: { parcelIndex?: number; parcelCount?: number }
): Promise<{ updated: number; created: boolean }> {
    const tnx = trackingNumber.trim();
    if (!accessToken || !orderId || !tnx) return { updated: 0, created: false };

    const order = await getEcomOrder(accessToken, orderId);
    if (!order) return { updated: 0, created: false };

    if (existingTrackingNumbers(order).includes(tnx.toUpperCase())) {
        return { updated: 0, created: false };
    }

    const lines = lineItemsFromOrder(order);
    if (!lines.length) return { updated: 0, created: false };

    const fulfilled = fulfilledQtyByLine(order);
    const parcelIndex = Math.max(0, split?.parcelIndex || 0);
    const parcelCount = Math.max(1, split?.parcelCount || 1);
    const lineItems = lines
        .map((line) => {
            const remaining = Math.max(0, line.quantity - (fulfilled.get(line.id) || 0));
            const quantity = Math.min(remaining, splitQty(line.quantity, parcelIndex, parcelCount));
            return { id: line.id, quantity };
        })
        .filter((line) => line.quantity > 0);

    if (!lineItems.length) return { updated: 0, created: false };

    const res = await fetch(
        `https://www.wixapis.com/ecom/v1/fulfillments/orders/${encodeURIComponent(orderId)}/create-fulfillment`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: accessToken,
            },
            body: JSON.stringify({
                fulfillment: {
                    lineItems,
                    trackingInfo: {
                        trackingNumber: tnx,
                        shippingProvider: 'Thai Nexus',
                        trackingLink: trackingUrl,
                    },
                },
            }),
        }
    );

    return { updated: 0, created: res.ok };
}
