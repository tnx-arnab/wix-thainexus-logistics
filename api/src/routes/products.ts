import { Router } from 'express';
import {
    getProductFlags,
    setProductFlags,
    setProductPhysicalOverride,
    readyForRatesFromPhysical,
    mergeProductPhysical,
    supabaseHasPhysicalOverrideColumn,
    PHYSICAL_OVERRIDE_MIGRATION_SQL,
    type ProductFlags,
    type ProductPhysicalOverride,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';
import { resolveProductPhysicalMap } from '../wix/productPhysical.js';
import {
    searchWixProducts,
    updateWixProductPackageDimensions,
    fetchWixProductsByIds,
    listWixCatalogItemIdsForPhysical,
} from '../wix/catalog.js';

const router = Router();

router.get('/search', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    try {
        const products = await searchWixProducts(session.accessToken, q, 50, session.siteId);
        return res.json(products);
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Product search failed',
        });
    }
});

router.get('/by-ids', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    try {
        const products = await fetchWixProductsByIds(session.accessToken, ids, session.siteId);
        return res.json(products);
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Failed to resolve products',
        });
    }
});

router.get('/:id/physical', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const id = req.params.id;
    try {
        const map = await resolveProductPhysicalMap(session.instanceId, session.accessToken, [id], session.siteId);
        const physical = map[id];
        if (!physical?.productId) {
            return res.status(404).json({ message: 'Product not found' });
        }
        return res.json({
            ...physical,
            readyForRates: readyForRatesFromPhysical(physical),
            wixEditorHint:
                'Color/size options do not add a weight field in Wix. Use Inventory and shipping → Shipping weight on the product, or enter weight (lb) below and Save.',
        });
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Failed to load product physical data',
        });
    }
});

router.put('/:id/physical', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const lengthCm = Number(req.body?.lengthCm);
    const widthCm = Number(req.body?.widthCm);
    const heightCm = Number(req.body?.heightCm);
    const weightLb = req.body?.weightLb != null ? Number(req.body.weightLb) : undefined;
    if (![lengthCm, widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) {
        return res.status(400).json({ message: 'lengthCm, widthCm, heightCm must be positive numbers' });
    }
    if (weightLb != null && (!Number.isFinite(weightLb) || weightLb <= 0)) {
        return res.status(400).json({ message: 'weightLb must be a positive number when provided' });
    }

    const id = req.params.id;
    try {
        await updateWixProductPackageDimensions(
            session.accessToken,
            id,
            { lengthCm, widthCm, heightCm },
            session.siteId,
            weightLb
        );

        const weightKg =
            weightLb != null && Number.isFinite(weightLb) && weightLb > 0
                ? weightLb * 0.45359237
                : undefined;

        const submittedOverride: ProductPhysicalOverride = {
            weightKg,
            lengthCm,
            widthCm,
            heightCm,
        };

        let savedOverride = false;
        let overrideError: string | undefined;
        const hasOverrideColumn = await supabaseHasPhysicalOverrideColumn();
        if (!hasOverrideColumn) {
            overrideError = `Missing Supabase column physical_override. Run: ${PHYSICAL_OVERRIDE_MIGRATION_SQL}`;
        } else {
            try {
                const catalogItemIds = await listWixCatalogItemIdsForPhysical(
                    session.accessToken,
                    id,
                    session.siteId
                );
                for (const catalogId of catalogItemIds) {
                    await setProductPhysicalOverride(session.instanceId, catalogId, submittedOverride);
                }
                savedOverride = true;
            } catch (err) {
                overrideError =
                    err instanceof Error ? err.message : 'Could not save physical_override in Supabase';
                console.warn('[physical_override]', overrideError);
            }
        }

        const map = await resolveProductPhysicalMap(session.instanceId, session.accessToken, [id], session.siteId);
        const physical = mergeProductPhysical(map[id] || { productId: id }, submittedOverride);

        const ready = readyForRatesFromPhysical(physical);
        const warnings: string[] = [];
        if (overrideError) warnings.push(overrideError);
        if (ready && !savedOverride) {
            warnings.push(
                'Checkout rates need Supabase physical_override until Wix returns weight for this product.'
            );
        }

        return res.json({
            ...physical,
            readyForRates: ready,
            saved: true,
            savedOverride,
            overrideError,
            warning: warnings.length ? warnings.join(' ') : undefined,
            wixWeightVisible: Boolean(physical.weightKg && !physical.fromOverride),
            note: physical.fromOverride
                ? 'Weight/size stored for Thai Nexus rates. Wix API may still hide weight on products with color options.'
                : undefined,
        });
    } catch (err) {
        return res.status(502).json({
            message: err instanceof Error ? err.message : 'Failed to save package dimensions',
        });
    }
});

router.get('/:id/flags', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const flags = await getProductFlags(session.instanceId, req.params.id);
        return res.json(flags);
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load flags',
        });
    }
});

router.put('/:id/flags', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const body = (req.body || {}) as Partial<ProductFlags>;
    const flags: ProductFlags = {
        isDocument: Boolean(body.isDocument),
        isBoxedProduct: Boolean(body.isBoxedProduct),
        shippingEligible: body.shippingEligible !== false,
    };

    try {
        const saved = await setProductFlags(session.instanceId, req.params.id, flags);
        return res.json(saved);
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to save flags',
        });
    }
});

router.get('/:id/document-flag', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const flags = await getProductFlags(session.instanceId, req.params.id);
        return res.json({ isDocument: flags.isDocument });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load document flag',
        });
    }
});

router.put('/:id/document-flag', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const existing = await getProductFlags(session.instanceId, req.params.id);
        const saved = await setProductFlags(session.instanceId, req.params.id, {
            ...existing,
            isDocument: Boolean(req.body?.isDocument),
        });
        return res.json({ isDocument: saved.isDocument });
    } catch (err) {
        return res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to save document flag',
        });
    }
});

export default router;
