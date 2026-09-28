import {
    findOrderShipmentByRequestNumber,
    getApiToken,
    saveOrderShipments,
} from '@thai-nexus/shared';
import { billingEventForShipmentCharge, sendWixBillingEvent } from './billingEvents.js';
import { allowedPaymentUrl, nextLocalPaymentStatus, type RemotePayState } from './shipmentPaymentState.js';

function functionsBaseUrl(): string {
    const base = process.env.THAI_NEXUS_FUNCTIONS_URL || 'https://app.thainexus.co.th/functions/';
    return base.endsWith('/') ? base : `${base}/`;
}

export async function readThaiNexusPaymentState(
    instanceId: string,
    requestNumber: string
): Promise<RemotePayState | null> {
    const token = await getApiToken(instanceId);
    if (!token) return null;

    let res: Response;
    try {
        res = await fetch(`${functionsBaseUrl()}wixShipmentPaymentStatus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ api_token: token, request_number: requestNumber }),
        });
    } catch {
        return null;
    }

    let body: Record<string, unknown> = {};
    try {
        const text = await res.text();
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        return null;
    }
    if (!res.ok || body.success === false) return null;
    const state = body.payment_state;
    if (state === 'paid' || state === 'confirming' || state === 'unpaid') return state;
    return null;
}

/**
 * Copy Thai Nexus payment state onto the local shipment.
 * The Wix revenue-share event is sent once, and only after the shipment is paid.
 */
export async function syncWixShipmentPayment(
    instanceId: string,
    requestNumber: string
): Promise<'unpaid' | 'paid' | 'confirming' | undefined> {
    const remote = await readThaiNexusPaymentState(instanceId, requestNumber);
    if (!remote) return undefined;

    const record = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    const row = record?.shipments?.find((item) => item.request_number === requestNumber);
    if (!record || !row) return undefined;

    const next = nextLocalPaymentStatus(row.payment_status, remote);
    const claim = `${requestNumber}:${Date.now()}:${crypto.randomUUID()}`;
    const shouldBill = next === 'paid' && !row.wix_billing_reported_at && row.api_price_thb != null && row.api_price_thb > 0;

    await saveOrderShipments({
        ...record,
        shipments: (record.shipments || []).map((item) =>
            item.request_number === requestNumber
                ? {
                      ...item,
                      payment_status: next,
                      paid_at: next === 'paid' ? item.paid_at || new Date().toISOString() : item.paid_at,
                      wix_billing_claim: shouldBill ? claim : item.wix_billing_claim,
                  }
                : item
        ),
    });

    if (!shouldBill) return next;

    const claimed = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    const claimedRow = claimed?.shipments?.find((item) => item.request_number === requestNumber);
    if (!claimed || !claimedRow || claimedRow.wix_billing_reported_at || claimedRow.wix_billing_claim !== claim) {
        return next;
    }

    const billing = await sendWixBillingEvent(
        instanceId,
        billingEventForShipmentCharge({
            apiPriceThb: row.api_price_thb as number,
            requestNumber,
            orderId: record.orderId,
            paymentIntentId: requestNumber,
        })
    );
    if (!billing.ok) return next;

    const reportedAt = new Date().toISOString();
    const latest = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    if (!latest) return next;
    await saveOrderShipments({
        ...latest,
        shipments: (latest.shipments || []).map((item) =>
            item.request_number === requestNumber
                ? { ...item, wix_billing_reported_at: item.wix_billing_reported_at || reportedAt }
                : item
        ),
    });

    return next;
}

export async function requestWixPaymentLink(input: {
    instanceId: string;
    requestNumber: string;
    amountThb: number;
    returnUrl: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
    const token = await getApiToken(input.instanceId);
    if (!token) return { ok: false, error: 'Thai Nexus API token is not configured' };

    let res: Response;
    try {
        res = await fetch(`${functionsBaseUrl()}createWixPaymentLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                api_token: token,
                request_number: input.requestNumber,
                amount: input.amountThb,
                return_url: input.returnUrl,
            }),
        });
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not create payment link' };
    }

    let body: Record<string, unknown> = {};
    try {
        const text = await res.text();
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        body = {};
    }

    const url = allowedPaymentUrl(typeof body.url === 'string' ? body.url : '') || '';
    if (!res.ok || body.success === false || !url) {
        const error = typeof body.error === 'string' ? body.error : 'Could not create payment link';
        return { ok: false, error };
    }
    return { ok: true, url };
}
