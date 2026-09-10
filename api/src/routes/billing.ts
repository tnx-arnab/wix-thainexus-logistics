import { Router, Request, Response } from 'express';
import { getSession } from '../auth.js';
import {
    calculateWixRevenueShare,
    isValidNumericAmount,
    sendWixBillingEvent,
    WixBillingEventInput,
    WixBillingEventType,
    DEFAULT_WIX_SHARE_RATE,
} from '../wix/billingEvents.js';
import { instanceIdFromAccessToken } from '../wix/tokens.js';
import { clientErrorMessage } from '../httpSecurity.js';

const router = Router();

const INSTANCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asInstanceId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return INSTANCE_UUID_RE.test(trimmed) ? trimmed : undefined;
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
