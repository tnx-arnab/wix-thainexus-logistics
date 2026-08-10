import { getValidAccessToken } from './tokens.js';

export type WixEcomOrder = Record<string, unknown>;

export async function searchRecentOrders(
    accessToken: string,
    limit = 15
): Promise<WixEcomOrder[]> {
    const res = await fetch('https://www.wixapis.com/ecom/v1/orders/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: accessToken,
        },
        body: JSON.stringify({
            search: {
                sort: [{ fieldName: 'createdDate', order: 'DESC' }],
                cursorPaging: { limit: Math.min(limit, 100) },
            },
        }),
    });

    const body = (await res.json()) as {
        orders?: WixEcomOrder[];
        message?: string;
    };
    if (!res.ok) {
        throw new Error(body.message || `Wix orders search failed (${res.status})`);
    }

    return body.orders || [];
}

/** Map Wix eCom order → webhook-shaped payload for processOrderWebhook. */
export function orderToWebhookPayload(order: WixEcomOrder): Record<string, unknown> {
    return { order };
}
