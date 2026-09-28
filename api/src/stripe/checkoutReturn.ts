/** Where Stripe should send the browser after Pay: the Wix dashboard page they started from. */

const META_SITE_RE = /^[A-Za-z0-9-]{8,80}$/;
const APP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dashboardReturnUrl(raw: string | undefined | null): string | null {
    if (!raw?.trim()) return null;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.hostname.toLowerCase() !== 'manage.wix.com') return null;
    if (!url.pathname.includes('/dashboard')) return null;
    url.hash = '';
    return url.toString();
}

export function shipmentPayReturnUrl(input: {
    requested?: string | null;
    metaSiteId?: string | null;
    appId?: string | null;
    appUrl: string;
}): string {
    const fromDashboard = dashboardReturnUrl(input.requested);
    if (fromDashboard) return fromDashboard;

    const metaSiteId = input.metaSiteId?.trim() || '';
    const appId = input.appId?.trim() || '';
    if (META_SITE_RE.test(metaSiteId) && APP_ID_RE.test(appId)) {
        return `https://manage.wix.com/dashboard/${metaSiteId}/app/${appId}`;
    }

    const appUrl = input.appUrl.replace(/\/$/, '');
    return `${appUrl}/?tab=shipments`;
}
