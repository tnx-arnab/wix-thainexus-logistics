import Stripe from 'stripe';
import {
    billingEventForShipmentCharge,
    sendWixBillingEvent,
    shipmentChargeSatang,
} from '../wix/billingEvents.js';
import {
    findOrderShipmentByRequestNumber,
    saveOrderShipments,
} from '@thai-nexus/shared';

const STRIPE_API_VERSION = '2026-07-29.dahlia' as Stripe.LatestApiVersion;

export function stripeSecretKey(): string {
    const live = process.env.STRIPE_SECRET_KEY?.trim() || '';
    const test = process.env.STRIPE_SECRET_KEY_TEST?.trim() || '';
    if (process.env.NODE_ENV === 'production') return live || test;
    return test || live;
}

export function stripeWebhookSecret(): string {
    const live = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
    const test = process.env.STRIPE_WEBHOOK_SECRET_TEST?.trim() || '';
    if (process.env.NODE_ENV === 'production') return live || test;
    return test || live;
}

export function getStripe(): Stripe {
    const key = stripeSecretKey();
    if (!key) throw new Error('Stripe secret key is not configured');
    return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

/** Stable Checkout label. Suffix is 8 letters derived from the request number. */
export function checkoutIntegrationId(requestNumber: string): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let hash = 2166136261;
    for (const char of requestNumber) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    let suffix = '';
    for (let i = 0; i < 8; i++) {
        suffix += alphabet[Math.abs(hash) % 26];
        hash = Math.imul(hash, 31) + i;
    }
    return `tnx_boxpay_${suffix}`;
}

export async function createShipmentCheckoutSession(input: {
    instanceId: string;
    requestNumber: string;
    orderId?: string;
    apiPriceThb: number;
    idempotencyKey: string;
}): Promise<{ id: string; url: string | null }> {
    const satang = shipmentChargeSatang(input.apiPriceThb);
    if (satang == null) throw new Error('Missing raw Thai Nexus price for this shipment');

    const appUrl = (process.env.APP_URL || 'https://wix.thainexus.co.th').replace(/\/$/, '');
    const request = encodeURIComponent(input.requestNumber);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
        {
            mode: 'payment',
            client_reference_id: input.requestNumber.slice(0, 200),
            metadata: {
                instance_id: input.instanceId,
                request_number: input.requestNumber,
                order_id: input.orderId || '',
            },
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'thb',
                        unit_amount: satang,
                        product_data: {
                            name: `Thai Nexus shipment ${input.requestNumber}`,
                        },
                    },
                },
            ],
            success_url: `${appUrl}/?billing=paid&request_number=${request}`,
            cancel_url: `${appUrl}/?billing=cancel&request_number=${request}`,
            integration_identifier: checkoutIntegrationId(input.requestNumber),
        },
        { idempotencyKey: input.idempotencyKey }
    );

    return { id: session.id, url: session.url };
}

export function verifyStripeWebhook(rawBody: string | Buffer, signature: string | undefined): Stripe.Event {
    const secret = stripeWebhookSecret();
    if (!secret) throw new Error('Stripe webhook secret is not configured');
    if (!signature) throw new Error('Missing Stripe signature');
    return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

export async function recordPaidCheckoutSession(session: Stripe.Checkout.Session): Promise<{
    ok: boolean;
    already?: boolean;
    billingOk?: boolean;
    error?: string;
}> {
    if (session.payment_status !== 'paid') {
        return { ok: true, already: true };
    }

    const instanceId = session.metadata?.instance_id?.trim();
    const requestNumber = session.metadata?.request_number?.trim();
    if (!instanceId || !requestNumber) {
        return { ok: false, error: 'Checkout session is missing shipment metadata' };
    }

    const record = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    if (!record) return { ok: false, error: 'Shipment was not found' };

    const row = (record.shipments || []).find((item) => item.request_number === requestNumber);
    if (!row) return { ok: false, error: 'Shipment was not found' };

    const expected = shipmentChargeSatang(row.api_price_thb);
    if (expected == null) {
        return { ok: false, error: 'Shipment has no raw API price' };
    }
    if (session.amount_total == null || session.amount_total !== expected) {
        return { ok: false, error: 'Paid amount does not match the raw API price' };
    }

    const paymentIntentId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;

    if (row.payment_status === 'paid' && row.wix_billing_reported_at) {
        return { ok: true, already: true, billingOk: true };
    }

    const paidAt = row.paid_at || new Date().toISOString();
    const claim = `${session.id}:${Date.now()}`;
    const shipments = (record.shipments || []).map((item) =>
        item.request_number === requestNumber
            ? {
                  ...item,
                  payment_status: 'paid' as const,
                  stripe_checkout_session_id: session.id,
                  stripe_payment_intent_id: paymentIntentId || item.stripe_payment_intent_id,
                  paid_at: paidAt,
                  wix_billing_claim: row.wix_billing_reported_at ? item.wix_billing_claim : claim,
              }
            : item
    );
    await saveOrderShipments({ ...record, shipments });

    if (row.wix_billing_reported_at) {
        return { ok: true, already: true, billingOk: true };
    }

    const claimed = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    const claimedRow = claimed?.shipments?.find((item) => item.request_number === requestNumber);
    if (claimedRow?.wix_billing_claim && claimedRow.wix_billing_claim !== claim) {
        return { ok: true, already: true };
    }

    const billing = await sendWixBillingEvent(
        instanceId,
        billingEventForShipmentCharge({
            apiPriceThb: row.api_price_thb as number,
            requestNumber,
            orderId: session.metadata?.order_id || record.orderId,
            paymentIntentId,
        })
    );

    if (!billing.ok) {
        return { ok: false, billingOk: false, error: billing.error || 'Wix billing event failed' };
    }

    const reported = await findOrderShipmentByRequestNumber(instanceId, requestNumber);
    if (reported) {
        await saveOrderShipments({
            ...reported,
            shipments: (reported.shipments || []).map((item) =>
                item.request_number === requestNumber
                    ? { ...item, wix_billing_reported_at: new Date().toISOString() }
                    : item
            ),
        });
    }

    return { ok: true, billingOk: true };
}
