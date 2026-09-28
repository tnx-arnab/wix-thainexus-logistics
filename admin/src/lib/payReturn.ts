const PAY_RETURN_KEY = 'tn_pay_return';
const MAX_AGE_MS = 60 * 60 * 1000;

export function dashboardReferrer(): string {
    try {
        const url = new URL(document.referrer);
        if (url.protocol !== 'https:' || url.hostname !== 'manage.wix.com') return '';
        if (!url.pathname.includes('/dashboard')) return '';
        return url.toString();
    } catch {
        return '';
    }
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
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { requestNumber?: string; at?: number };
        const requestNumber = parsed.requestNumber?.trim() || '';
        if (!/^[A-Za-z0-9-]{1,40}$/.test(requestNumber) || !parsed.at) return null;
        if (Date.now() - parsed.at > MAX_AGE_MS) return null;
        return requestNumber;
    } catch {
        return null;
    }
}

export function consumePayReturn(): string | null {
    const requestNumber = peekPayReturn();
    try {
        localStorage.removeItem(PAY_RETURN_KEY);
    } catch {
        // ignore
    }
    return requestNumber;
}
