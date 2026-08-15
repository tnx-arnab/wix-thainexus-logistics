import { Router, type Request, type Response } from 'express';
import { logInstallEvent } from '@thai-nexus/shared';
import {
    encodePayload,
    escapeHtml,
    getAppBaseUrl,
    oauthErrorPage,
    oauthHtmlPage,
    persistOAuthSession,
    removeDataStore,
} from '../auth.js';
import { exchangeWixToken, resolveWixInstallIdentity } from '../wix/oauth.js';
import { dashboardIdentityFromQuery } from '../wix/instanceParam.js';
import { instanceIdFromWixClaims, webhookVerifySkipped } from '../wix/verify.js';
import { verifiedWebhookClaims } from '../wix/webhookAuth.js';
import { bootstrapCookieHeader, clientErrorMessage, requestIsHttps } from '../httpSecurity.js';

const router = Router();

function oauthRedirectUrl(): string {
    const fromEnv = process.env.AUTH_CALLBACK?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    return `${getAppBaseUrl()}/api/oauth/v1/signup`;
}

function wixInstallerInstallUrl(token: string, state?: string): string {
    const appId = process.env.WIX_APP_ID?.trim();
    if (!appId) throw new Error('WIX_APP_ID is not set');

    const params = new URLSearchParams({
        token,
        appId,
        redirectUrl: oauthRedirectUrl(),
    });
    if (state) params.set('state', state);

    return `https://www.wix.com/installer/install?${params.toString()}`;
}

/** Wix OAuth callback: exchange authorization code and open dashboard. */
async function handleOAuthCallback(req: Request, res: Response, routeLabel: string) {
    const authCode = typeof req.query.code === 'string' ? req.query.code : '';
    const installToken = typeof req.query.token === 'string' ? req.query.token : '';
    const isSignup = routeLabel.includes('signup');

    if (isSignup && !authCode && installToken) {
        const qs = new URLSearchParams({ token: installToken });
        if (typeof req.query.state === 'string') qs.set('state', req.query.state);
        return res.redirect(`/api/oauth/v1/authorize?${qs.toString()}`);
    }

    const exchangeCode = authCode || (isSignup ? '' : installToken);
    const instanceParam =
        typeof req.query.instance === 'string' ? req.query.instance : '';

    try {
        await logInstallEvent({
            route: routeLabel,
            ok: false,
            message: 'auth_start',
            has_code: Boolean(exchangeCode),
            query_keys: Object.keys(req.query),
        });

        if (!exchangeCode) {
            const redirectHint = escapeHtml(oauthRedirectUrl());
            return res.status(400).send(
                oauthHtmlPage(
                    'Missing authorization code',
                    `<div class="err">Expected <code>code</code> from Wix after permissions. Confirm Redirect URL is <code>${redirectHint}</code> and matches the Dev Center exactly.</div>`
                )
            );
        }

        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
        const tokens = await exchangeWixToken(exchangeCode, oauthRedirectUrl());
        const identity = instanceParam ? dashboardIdentityFromQuery(instanceParam) : null;
        const install = await resolveWixInstallIdentity(tokens, exchangeCode, req.query);
        const instanceId = install.instanceId;
        const userId = identity?.userId || 'owner';

        await persistOAuthSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: 'wix',
            instance_id: instanceId,
            site_id: install.siteId || tokens.siteId,
            meta_site_id: install.metaSiteId || tokens.metaSiteId,
            user: { id: userId, email: 'merchant@wix.com' },
        });

        await logInstallEvent({
            route: routeLabel,
            ok: true,
            message: 'install_ok',
            instance_id: instanceId,
        });

        const context = encodePayload({
            instance_id: instanceId,
            context: instanceId,
            user: { id: userId, email: 'merchant@wix.com' },
            owner: { id: userId, email: 'merchant@wix.com' },
            access_token: tokens.access_token,
            scope: 'wix',
            site_id: install.siteId || tokens.siteId,
        });

        const base = getAppBaseUrl();
        const close =
            typeof req.query.close === 'string' && req.query.close === '1';
        if (close) {
            return res.redirect(
                `https://www.wix.com/installer/close-window?access_token=${encodeURIComponent(tokens.access_token)}`
            );
        }

        res.setHeader('Set-Cookie', bootstrapCookieHeader(context, 24 * 60 * 60, requestIsHttps(req)));
        res.setHeader('Referrer-Policy', 'no-referrer');
        return res.redirect(`${base}/`);
    } catch (err) {
        const message = clientErrorMessage(err, 'Install failed');
        await logInstallEvent({
            route: routeLabel,
            ok: false,
            message: err instanceof Error ? err.message : 'OAuth failed',
            has_code: Boolean(exchangeCode),
        });
        return res.status(500).send(oauthErrorPage('Install failed', message));
    }
}

/**
 * Wix self-hosted install entry (App URL → …/api/oauth/v1/authorize?token=).
 * Redirects to Wix permission consent; callback is AUTH_CALLBACK or /api/oauth/v1/signup.
 */
router.get('/oauth/v1/authorize', async (req, res) => {
    try {
        const token = typeof req.query.token === 'string' ? req.query.token : '';
        if (!token) {
            return res.status(403).send('Cannot authorize without token query parameter');
        }

        await logInstallEvent({
            route: '/api/oauth/v1/authorize',
            ok: true,
            message: 'redirect_installer',
            has_code: true,
        });

        const state =
            typeof req.query.state === 'string' ? req.query.state : undefined;
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
        return res.redirect(wixInstallerInstallUrl(token, state));
    } catch (err) {
        const message = err instanceof Error ? err.message : 'authorize failed';
        return res.status(500).send(oauthErrorPage('Authorize failed', message));
    }
});

/** OAuth redirect URL after Wix consent (authorization code). */
router.get('/oauth/v1/signup', (req, res) =>
    handleOAuthCallback(req, res, '/api/oauth/v1/signup')
);

/** Legacy / alternate callback (same handler). */
router.get('/auth', (req, res) => handleOAuthCallback(req, res, '/api/auth'));

/** Dashboard entry - redirect signed installs into auth if needed. */
router.get('/load', async (req, res) => {
    const token =
        (typeof req.query.token === 'string' && req.query.token) ||
        (typeof req.query.code === 'string' && req.query.code);
    if (token) {
        const qs = new URLSearchParams(req.query as Record<string, string>).toString();
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (code) {
            return res.redirect(`/api/oauth/v1/signup?${qs}`);
        }
        return res.redirect(`/api/oauth/v1/authorize?${qs}`);
    }

    const base = getAppBaseUrl();
    return res.redirect(`${base}/`);
});

router.post('/uninstall', async (req, res) => {
    try {
        const claims = verifiedWebhookClaims(req.headers.authorization);
        if (claims === null) {
            return res.status(401).json({ ok: false, reason: 'invalid-jwt' });
        }

        const body = req.body || {};
        const instanceId =
            instanceIdFromWixClaims(claims || {}) ||
            (webhookVerifySkipped()
                ? body.instanceId || body.instance_id || body.data?.instanceId
                : undefined);
        if (instanceId) {
            await removeDataStore({
                instance_id: String(instanceId),
                user: { id: '0', email: '' },
            });
        }
        return res.json({ ok: true });
    } catch {
        return res.json({ ok: true });
    }
});

export default router;
