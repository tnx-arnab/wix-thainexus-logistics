const PAY_RETURN_KEY = 'tn_pay_return';
const PAY_RETURN_COOKIE = 'tn_pay_return';
const MAX_AGE_MS = 60 * 60 * 1000;
const REQUEST_NUMBER_RE = /^[A-Za-z0-9-]{1,40}$/;
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

export function dashboardReferrer(): string {
    try {
        const url = new URL(document.referrer);
        if (url.protocol !== 'https:' || url.username || url.password) return '';
        if (!DASHBOARD_HOSTS.has(url.hostname.toLowerCase())) return '';
        if (!DASHBOARD_PATH_RE.test(url.pathname)) return '';
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

function readPayReturnCookie(): string | null {
    try {
        for (const part of document.cookie.split(';')) {
            const trimmed = part.trim();
            if (!trimmed.startsWith(`${PAY_RETURN_COOKIE}=`)) continue;
            const value = decodeURIComponent(trimmed.slice(PAY_RETURN_COOKIE.length + 1)).trim();
            return REQUEST_NUMBER_RE.test(value) ? value : null;
        }
    } catch {
        // ignore
    }
    return null;
}

function clearPayReturnCookie(): void {
    document.cookie = `${PAY_RETURN_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=None; Partitioned`;
}

/** Leave the Wix iframe for Stripe without reading the parent window. */
export function leaveForCheckout(url: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_top';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function rememberPayReturn(requestNumber: string): void {
    try {
        localStorage.setItem(
            PAY_RETURN_KEY,
            JSON.stringify({ requestNumber, at: Date.now() })
        );
    } catch {
        // private mode
    }
}

export function peekPayReturn(): string | null {
    try {
        const raw = localStorage.getItem(PAY_RETURN_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { requestNumber?: string; at?: number };
            const requestNumber = parsed.requestNumber?.trim() || '';
            if (
                REQUEST_NUMBER_RE.test(requestNumber) &&
                parsed.at &&
                Date.now() - parsed.at <= MAX_AGE_MS
            ) {
                return requestNumber;
            }
        }
    } catch {
        // private mode
    }
    return readPayReturnCookie();
}

export function consumePayReturn(): string | null {
    const requestNumber = peekPayReturn();
    try {
        localStorage.removeItem(PAY_RETURN_KEY);
    } catch {
        // ignore
    }
    clearPayReturnCookie();
    return requestNumber;
}
