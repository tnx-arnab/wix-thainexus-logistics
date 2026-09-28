import { getApiToken } from '@thai-nexus/shared';

function functionsBaseUrl(): string {
    const base = process.env.THAI_NEXUS_FUNCTIONS_URL || 'https://app.thainexus.co.th/functions/';
    return base.endsWith('/') ? base : `${base}/`;
}

export async function reportWixShipmentPayment(input: {
    instanceId: string;
    requestNumber: string;
    amountThb: number;
    paymentIntentId: string;
    sessionId: string;
    paidAt: string;
}): Promise<{ ok: boolean; shipmentStatus?: string; error?: string }> {
    const token = await getApiToken(input.instanceId);
    if (!token) return { ok: false, error: 'Thai Nexus API token is not configured' };
    if (!input.paymentIntentId) {
        return { ok: false, error: 'Checkout session is missing a payment intent' };
    }

    let res: Response;
    try {
        res = await fetch(`${functionsBaseUrl()}wixShipmentPayment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                api_token: token,
                request_number: input.requestNumber,
                payment_status: 'confirmed',
                payment_method: 'stripe',
                amount: input.amountThb,
                currency: 'THB',
                stripe_payment_intent_id: input.paymentIntentId,
                stripe_session_id: input.sessionId,
                paid_at: input.paidAt,
            }),
        });
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'Thai Nexus payment update failed',
        };
    }

    let body: Record<string, unknown> = {};
    try {
        const text = await res.text();
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        body = {};
    }

    if (!res.ok || body.success === false) {
        const error = typeof body.error === 'string' ? body.error : 'Thai Nexus payment update failed';
        return { ok: false, error };
    }

    const shipmentStatus = typeof body.shipment_status === 'string' ? body.shipment_status : undefined;
    return { ok: true, shipmentStatus };
}
