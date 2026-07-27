import { Router } from 'express';
import {
    type CommissionRule,
    getConfigPublic,
    type ShipperProfile,
    type ShippingBox,
    saveConfig,
    validateShipper,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';

const router = Router();

const sessionHelp =
    'Close this tab, then open Apps → Thai Nexus again from the Wix Dashboard. If it persists, uninstall and reinstall once.';

router.get('/', async (req, res) => {
    try {
        const session = await getSession(req);
        if (!session) {
            const hasContext = typeof req.query.context === 'string' && req.query.context.length > 0;

            return res.status(401).json({
                message: hasContext
                    ? `Site not connected to the app yet. ${sessionHelp}`
                    : 'Open this app from Wix Dashboard → Apps → Thai Nexus (do not bookmark the URL).',
            });
        }

        return res.json(await getConfigPublic(session.instanceId));
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load settings',
        });
    }
});

router.put('/', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: sessionHelp });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
            message:
                'Request body was empty. If this persists after deploy, hard-refresh the app and try again.',
        });
    }

    const { apiToken, shipper, commissionRules, boxes, disabledServiceIds, shippingIneligibleProductIds } =
        body as {
            apiToken?: string;
            shipper?: ShipperProfile;
            commissionRules?: CommissionRule[];
            boxes?: ShippingBox[];
            disabledServiceIds?: string[];
            shippingIneligibleProductIds?: Array<string | number>;
        };

    if (shipper) {
        const shipperError = validateShipper(shipper);
        if (shipperError) {
            return res.status(400).json({ message: shipperError });
        }
    }

    try {
        const existing = await getConfigPublic(session.instanceId);
        const shipperToSave = shipper || existing.shipper;
        const shipperError = validateShipper(shipperToSave);

        if (shipperError) {
            return res.status(400).json({ message: shipperError });
        }

        const saved = await saveConfig(session.instanceId, {
            apiToken,
            shipper: shipperToSave,
            commissionRules: commissionRules ?? existing.commissionRules,
            boxes: boxes ?? existing.boxes,
            disabledServiceIds: disabledServiceIds ?? existing.disabledServiceIds,
            shippingIneligibleProductIds:
                shippingIneligibleProductIds ?? existing.shippingIneligibleProductIds ?? [],
        });

        return res.json({ ...saved, instanceId: session.instanceId });
    } catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Save failed',
        });
    }
});

export default router;
