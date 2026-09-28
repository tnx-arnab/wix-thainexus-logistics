/** Where Stripe should send the browser after Pay: the Wix dashboard page they started from. */

const DASHBOARD_SITE_ID_RE = /^[A-Za-z0-9-]{8,80}$/;
const APP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASHBOARD_PATH_RE = /^\/dashboard\/([A-Za-z0-9-]{8,80})(?:\/|$)/;

const DASHBOARD_HOSTS = new Set([
    'manage.wix.com',
    'www.wix.com',
    'editor.wix.com',
    'create.wix.com',
    'manage.wixstudio.com',
    'create.wixstudio.com',
    'editor.wixstudio.com',
    'manage.editorx.com',
]);

export function dashboardSiteId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return DASHBOARD_SITE_ID_RE.test(trimmed) ? trimmed : undefined;
}

export function dashboardReturnUrl(raw: string | undefined | null): string | null {
    if (!raw?.trim()) return null;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!DASHBOARD_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (!DASHBOARD_PATH_RE.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
}

export function sameCheckoutReturn(stored: string | null | undefined, next: string): boolean {
    if (!stored) return false;
    if (stored === next) return true;
    const left = dashboardReturnUrl(stored);
    const right = dashboardReturnUrl(next);
    return Boolean(left && right && left === right);
}

export function shipmentPayReturnUrl(input: {
    requested?: string | null;
    metaSiteId?: string | null;
    appId?: string | null;
    appUrl: string;
}): string {
    const fromDashboard = dashboardReturnUrl(input.requested);
    if (fromDashboard) return fromDashboard;

    const metaSiteId = dashboardSiteId(input.metaSiteId) || '';
    const appId = input.appId?.trim() || '';
    if (metaSiteId && APP_ID_RE.test(appId)) {
        return `https://manage.wix.com/dashboard/${metaSiteId}/app/${appId}`;
    }

    const appUrl = input.appUrl.replace(/\/$/, '');
    return `${appUrl}/?tab=shipments`;
}
