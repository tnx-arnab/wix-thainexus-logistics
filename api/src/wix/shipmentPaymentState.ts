export type LocalPayStatus = 'unpaid' | 'paid' | 'confirming';
export type RemotePayState = 'paid' | 'confirming' | 'unpaid';

const PAYMENT_HOSTS = new Set([
    'checkout.stripe.com',
    'www.paypal.com',
    'paypal.com',
    'www.sandbox.paypal.com',
    'sandbox.paypal.com',
]);

/** Only the Thai Nexus pay page, or a real card/PayPal checkout, may leave the Wix dashboard. */
export function allowedPaymentUrl(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'app.thainexus.co.th' && url.pathname.startsWith('/payment/')) return url.toString();
    if (PAYMENT_HOSTS.has(host)) return url.toString();
    return null;
}

/** Paid stays paid. A later staff approval upgrades confirming to paid. */
export function nextLocalPaymentStatus(
    current: LocalPayStatus | null | undefined,
    remote: RemotePayState
): LocalPayStatus {
    if (current === 'paid' || remote === 'paid') return 'paid';
    if (remote === 'confirming' || current === 'confirming') return 'confirming';
    return 'unpaid';
}
