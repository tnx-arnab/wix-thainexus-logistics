import { Router } from 'express';
import {
    getSupabase,
    listInstallLogs,
    listRateTraces,
    getConfig,
    getApiToken,
    validateStoreReadyForRates,
    supabaseHasPhysicalOverrideColumn,
    PHYSICAL_OVERRIDE_MIGRATION_SQL,
    isDebugEnabled,
} from '@thai-nexus/shared';
import { getSession } from '../auth.js';

import { normalizeWixPublicKeyPem } from '../wix/verify.js';

const router = Router();

/** Public install diagnostics (booleans only; no secrets, URLs, or counts). */
router.get('/', async (_req, res) => {
    let supabaseOk = false;
    let physicalOverrideColumn = false;

    try {
        const { error } = await getSupabase()
            .from('stores')
            .select('instance_id', { count: 'exact', head: true });
        supabaseOk = !error;
        if (supabaseOk) {
            physicalOverrideColumn = await supabaseHasPhysicalOverrideColumn();
        }
    } catch {
        supabaseOk = false;
    }

    const publicKeyRaw = process.env.WIX_PUBLIC_KEY?.trim() || '';
    const publicKeyPem = normalizeWixPublicKeyPem(publicKeyRaw);
    const publicKeyLooksValid =
        publicKeyPem.includes('BEGIN PUBLIC KEY') || publicKeyPem.includes('BEGIN RSA PUBLIC KEY');

    res.json({
        ready:
            Boolean(process.env.WIX_APP_ID?.trim()) &&
            Boolean(process.env.WIX_APP_SECRET) &&
            Boolean(process.env.JWT_KEY) &&
            Boolean(process.env.ENCRYPTION_KEY) &&
            Boolean(process.env.WIX_PUBLIC_KEY) &&
            supabaseOk,
        checks: {
            wix_app_id: Boolean(process.env.WIX_APP_ID),
            wix_app_secret: Boolean(process.env.WIX_APP_SECRET),
            wix_public_key: Boolean(process.env.WIX_PUBLIC_KEY),
            wix_public_key_pem_ok: publicKeyLooksValid,
            jwt_key: Boolean(process.env.JWT_KEY),
            encryption_key: Boolean(process.env.ENCRYPTION_KEY),
            app_url: Boolean(process.env.APP_URL?.trim()),
            auth_callback: Boolean(process.env.AUTH_CALLBACK?.trim()),
            supabase_url: Boolean(process.env.SUPABASE_URL),
            supabase_secret_key: Boolean(
                process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
            ),
            supabase_ok: supabaseOk,
            product_flags_physical_override: physicalOverrideColumn,
        },
    });
});

/** Session-gated checklist for checkout shipping rates. */
router.get('/rates-ready', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const blockers: string[] = [];
    const warnings: string[] = [];
    const config = await getConfig(session.instanceId);
    const hasThaiNexusToken = Boolean(await getApiToken(session.instanceId));
    const storeError = validateStoreReadyForRates(config, hasThaiNexusToken);
    if (storeError) blockers.push(storeError);

    const physicalOverrideColumn = await supabaseHasPhysicalOverrideColumn();
    if (!physicalOverrideColumn) {
        blockers.push(
            `Supabase product_flags.physical_override is missing. Run: ${PHYSICAL_OVERRIDE_MIGRATION_SQL}`
        );
    }

    let recentSpiHits = 0;
    try {
        const traces = await listRateTraces(20);
        recentSpiHits = traces.filter((t) => t.store_id === session.instanceId).length;
    } catch {
        warnings.push('Could not read SPI traces (debug_logs table).');
    }

    if (recentSpiHits === 0) {
        warnings.push(
            'No recent Shipping Rates SPI calls for this store. Confirm deploymentUri is https://wix.thainexus.co.th/, enable Thai Nexus under Manage your apps, then open checkout shipping from the cart.'
        );
    }

    return res.json({
        ready: blockers.length === 0,
        instanceId: session.instanceId,
        blockers,
        warnings,
        recentSpiHits,
        hints: {
            spi_traces_url: '/api/setup/spi-traces',
            products_tab: 'Save weight + L/W/H until readyForRates is green.',
            console_404c:
                'App not found for script (404C) is Wix dashboard noise. Reinstall Test app on the site if the app panel fails to load.',
        },
    });
});

router.get('/spi-traces', async (req, res) => {
    if (!isDebugEnabled()) {
        return res.status(404).json({ message: 'Not found' });
    }
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const traces = await listRateTraces(50);
        const forStore = traces.filter((t) => t.store_id === session.instanceId);
        res.json({
            hint: 'Refresh checkout shipping step, then reload this URL.',
            count: forStore.length,
            instanceId: session.instanceId,
            traces: forStore.map((t) => ({
                at: t.logged_at,
                phase: t.phase,
                path: t.path,
                instance: t.store_id,
                country: t.destination,
                city: t.destination_city,
                zip: t.destination_zip,
                items: t.items,
                quotes: t.quotes,
                ok: t.ok,
                ms: t.duration_ms,
                message: t.message,
            })),
        });
    } catch (err) {
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to read SPI traces',
            traces: [],
        });
    }
});

router.get('/logs', async (req, res) => {
    if (!isDebugEnabled()) {
        return res.status(404).json({ message: 'Not found' });
    }
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const logs = await listInstallLogs(40);
        const forStore = logs.filter((l) => l.instance_id === session.instanceId);
        const authHits = forStore.filter((l) => l.route === '/api/auth');
        const lastAuth = authHits[0];

        res.json({
            count: forStore.length,
            instanceId: session.instanceId,
            install_logs_table_ok: true,
            summary: lastAuth
                ? {
                      last_auth_at: lastAuth.logged_at,
                      last_auth_ok: lastAuth.ok,
                      last_auth_message: lastAuth.message,
                  }
                : {
                      hint: 'No /api/auth yet. Install the app from Wix to create the first OAuth row.',
                  },
            logs: forStore.map((l) => ({
                at: l.logged_at,
                route: l.route,
                ok: l.ok,
                instance: l.instance_id,
                message: l.message,
                has_code: l.data?.has_code,
            })),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read logs';
        res.status(500).json({
            install_logs_table_ok: false,
            message,
            logs: [],
        });
    }
});

/** Session-gated health for linked instance. */
router.get('/instance', async (req, res) => {
    const session = await getSession(req);
    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json({
        ok: true,
        instanceId: session.instanceId,
        message: 'Wix Shipping Rates SPI is configured in App Dashboard (deploymentUri).',
    });
});

export default router;
