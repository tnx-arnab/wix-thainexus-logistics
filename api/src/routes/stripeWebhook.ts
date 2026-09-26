import { Router } from 'express';
import type { Request } from 'express';
import { recordPaidCheckoutSession, verifyStripeWebhook } from '../stripe/checkout.js';

const router = Router();

router.post('/', async (req: Request, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
    const signatureHeader = req.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    let event;
    try {
        event = verifyStripeWebhook(raw, typeof signature === 'string' ? signature : undefined);
    } catch (err) {
        return res.status(400).json({
            ok: false,
            message: err instanceof Error ? err.message : 'Invalid Stripe webhook',
        });
    }

    if (
        event.type !== 'checkout.session.completed' &&
        event.type !== 'checkout.session.async_payment_succeeded'
    ) {
        return res.json({ ok: true, ignored: true });
    }

    const result = await recordPaidCheckoutSession(event.data.object);
    if (!result.ok) {
        return res.status(500).json({ ok: false, message: result.error || 'Could not record payment' });
    }

    return res.json({ ok: true, already: Boolean(result.already), billingOk: Boolean(result.billingOk) });
});

export default router;
