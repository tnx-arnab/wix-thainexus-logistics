import { Router, Request, Response } from 'express';
import { getSession } from '../auth.js';
import {
    calculateWixRevenueShare,
    isValidNumericAmount,
    sendWixBillingEvent,
    WixBillingEventInput,
    WixBillingEventType,
    DEFAULT_WIX_SHARE_RATE,
    shipmentChargeSatang,
} from '../wix/billingEvents.js';
import { instanceIdFromAccessToken } from '../wix/tokens.js';
import { clientErrorMessage, payReturnCookieHeader, requestIsHttps } from '../httpSecurity.js';
import { findOrderShipmentByRequestNumber, getStore, saveStoreSiteIds } from '@thai-nexus/shared';
import { fetchWixAppInstance } from '../wix/oauth.js';
import { getStripe } from '../stripe/checkout.js';
import { dashboardSiteId, shipmentPayReturnUrl } from '../stripe/checkoutReturn.js';
import { requestWixPaymentLink } from '../wix/shipmentPaymentSync.js';

const router = Router();

const INSTANCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asInstanceId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return INSTANCE_UUID_RE.test(trimmed) ? trimmed : undefined;
}

async function metaSiteIdForCheckout(instanceId: string, accessToken: string): Promise<string> {
    try {
        const store = await getStore(instanceId);
        const stored = dashboardSiteId(store?.meta_site_id);
        if (stored) return stored;

        const appInstance = await fetchWixAppInstance(accessToken);
        const metaSiteId = dashboardSiteId(appInstance.metaSiteId);
        if (metaSiteId) {
            await saveStoreSiteIds(instanceId, {
                siteId: appInstance.siteId,
                metaSiteId,
            }).catch(() => undefined);
        }
        return metaSiteId || '';
    } catch {
        return '';
    }
}

function rememberPayReturn(req: Request, res: Response, requestNumber: string): void {
    res.setHeader('Set-Cookie', payReturnCookieHeader(requestNumber, requestIsHttps(req)));
}

/**
 * Endpoint to trigger Wix External Billing Events.
 * Can be called by:
 * 1. Admin/merchant session (authenticated via Wix context or session cookie).
 * 2. Thai Nexus core backend (providing instance_id / instanceId in body, query, or Bearer auth token).
 */
router.post('/events', async (req: Request, res: Response) => {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const query = req.query as Record<string, unknown>;
        const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

        const session = await getSession(req);

        const instanceId =
            asInstanceId(body.instance_id) ||
            asInstanceId(body.instanceId) ||
            asInstanceId(query.instance_id) ||
            asInstanceId(query.instanceId) ||
            (session ? asInstanceId(session.instanceId) : undefined) ||
            (authHeader ? asInstanceId(instanceIdFromAccessToken(authHeader)) : undefined);

        if (!instanceId) {
            return res.status(400).json({
                ok: false,
                message: 'Missing or invalid instanceId in request.',
            });
        }

        const billingTypeRaw = String(body.billing_type || body.billingType || query.billing_type || 'CHARGE').toUpperCase();
        if (billingTypeRaw !== 'CHARGE' && billingTypeRaw !== 'REFUND') {
            return res.status(400).json({
                ok: false,
                message: 'Invalid billing_type. Must be CHARGE or REFUND.',
            });
        }
        const billing_type = billingTypeRaw as WixBillingEventType;

        const gross_revenue = body.gross_revenue ?? body.grossRevenue ?? query.gross_revenue;
        const net_revenue = body.net_revenue ?? body.netRevenue ?? query.net_revenue;
        const wix_share = body.wix_share ?? body.wixShare ?? query.wix_share;

        if (!isValidNumericAmount(gross_revenue)) {
            return res.status(400).json({
                ok: false,
                message: 'Missing or invalid gross_revenue amount.',
            });
        }

        if (!isValidNumericAmount(net_revenue)) {
            return res.status(400).json({
                ok: false,
                message: 'Missing or invalid net_revenue amount.',
            });
        }

        const eventInput: WixBillingEventInput = {
            billing_type,
            gross_revenue: gross_revenue as string | number,
            net_revenue: net_revenue as string | number,
            wix_share: wix_share !== undefined && isValidNumericAmount(wix_share) ? (wix_share as string | number) : undefined,
            created_date: typeof body.created_date === 'string' ? body.created_date : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            order_id: typeof body.order_id === 'string' ? body.order_id : typeof body.orderId === 'string' ? body.orderId : undefined,
            transaction_id: typeof body.transaction_id === 'string' ? body.transaction_id : typeof body.transactionId === 'string' ? body.transactionId : undefined,
            external_id: typeof body.external_id === 'string' ? body.external_id : typeof body.externalId === 'string' ? body.externalId : undefined,
        };

        const result = await sendWixBillingEvent(instanceId, eventInput);

        if (!result.ok) {
            return res.status(result.status || 500).json({
                ok: false,
                message: result.error || 'Failed to dispatch Wix billing event',
                data: result.data,
            });
        }

        return res.status(200).json({
            ok: true,
            status: result.status,
            data: result.data,
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            message: clientErrorMessage(err, 'Failed to process billing event request'),
        });
    }
});

/**
 * Open a one-time Thai Nexus payment link for one shipment.
 * Amount is the stored raw API price in THB.
 */
router.post('/checkout', async (req: Request, res: Response) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ ok: false, message: 'Session expired. Reopen from Wix Dashboard Apps.' });
    }

    const requestNumber = String((req.body || {}).request_number || (req.body || {}).requestNumber || '').trim();
    if (!requestNumber) {
        return res.status(400).json({ ok: false, message: 'Missing request_number.' });
    }

    const record = await findOrderShipmentByRequestNumber(session.instanceId, requestNumber);
    const row = record?.shipments?.find((item) => item.request_number === requestNumber);
    if (!record || !row) {
        return res.status(404).json({ ok: false, message: 'Shipment was not found.' });
    }
    if (row.payment_status === 'paid') {
        return res.status(409).json({ ok: false, message: 'This shipment is already paid.' });
    }
    if (row.payment_status === 'confirming') {
        return res.status(409).json({ ok: false, message: 'Payment is awaiting approval.' });
    }

    const satang = shipmentChargeSatang(row.api_price_thb);
    if (satang == null) {
        return res.status(409).json({
            ok: false,
            message: 'Raw API price was not captured at checkout for this shipment.',
        });
    }

    const requestedReturn = String((req.body || {}).return_url || (req.body || {}).returnUrl || '');
    const metaSiteId = await metaSiteIdForCheckout(session.instanceId, session.accessToken);
    const appUrl = (process.env.APP_URL || 'https://wix.thainexus.co.th').replace(/\/$/, '');
    const returnUrl = shipmentPayReturnUrl({
        requested: requestedReturn,
        metaSiteId,
        appId: process.env.WIX_APP_ID,
        appUrl,
    });

    try {
        if (row.stripe_checkout_session_id) {
            try {
                const stripe = getStripe();
                const existing = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
                if (existing.payment_status === 'paid' || existing.status === 'complete') {
                    if (existing.payment_status === 'paid') {
                        const { recordPaidCheckoutSession } = await import('../stripe/checkout.js');
                        await recordPaidCheckoutSession(existing);
                    }
                    return res.status(409).json({
                        ok: false,
                        message: existing.payment_status === 'paid'
                            ? 'This shipment is already paid.'
                            : 'Payment is still processing.',
                    });
                }
                if (existing.status === 'open') {
                    await stripe.checkout.sessions.expire(existing.id).catch(() => undefined);
                }
            } catch {
                // A leftover Wix Stripe session must not block the new payment link.
            }
        }

        const link = await requestWixPaymentLink({
            instanceId: session.instanceId,
            requestNumber,
            amountThb: row.api_price_thb as number,
            returnUrl,
        });
        if (!link.url) {
            return res.status(502).json({ ok: false, message: link.error || 'Could not create payment link.' });
        }

        rememberPayReturn(req, res, requestNumber);
        return res.json({ ok: true, url: link.url });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            message: clientErrorMessage(err, 'Could not start payment'),
        });
    }
});

/**
 * Utility endpoint to calculate revenue share preview without sending the event.
 */
router.post('/preview', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const net_revenue = body.net_revenue ?? body.netRevenue;
    if (!isValidNumericAmount(net_revenue)) {
        return res.status(400).json({
            ok: false,
            message: 'Missing or invalid net_revenue amount.',
        });
    }

    const share = calculateWixRevenueShare(net_revenue as string | number);
    return res.json({
        ok: true,
        net_revenue: String(net_revenue),
        share_rate: DEFAULT_WIX_SHARE_RATE,
        wix_share: share,
    });
});

export default router;
