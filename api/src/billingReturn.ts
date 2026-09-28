/** Stripe Checkout returns the browser to `/?billing=paid|cancel` with no Wix session. */

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function requestLabel(raw: string | null): string {
    const value = (raw || '').trim();
    if (!/^[A-Za-z0-9-]{1,40}$/.test(value)) return '';
    return value;
}

export function billingReturnHtml(url: URL): string | null {
    if (url.pathname !== '/' && url.pathname !== '') return null;
    const billing = url.searchParams.get('billing');
    if (billing !== 'paid' && billing !== 'cancel') return null;

    const paid = billing === 'paid';
    const requestNumber = requestLabel(url.searchParams.get('request_number'));
    const title = paid ? 'Payment received' : 'Payment cancelled';
    const detail = requestNumber
        ? `Shipment ${escapeHtml(requestNumber)}.`
        : 'Thai Nexus shipment.';
    const next = paid
        ? 'Stripe accepted the payment. You can close this page and return to the Wix dashboard.'
        : 'No payment was taken. You can close this page and try again from the Wix dashboard.';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${title}</title>
<style>
html,body{margin:0;height:100%;background:#0b1f3a;color:#fff}
body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif}
.wrap{text-align:center;max-width:28rem;padding:2rem}
h1{margin:0;font-size:1.75rem;font-weight:650;letter-spacing:.01em}
p{margin:.9rem 0 0;color:#d6deea;font-size:1rem;line-height:1.5}
</style>
</head>
<body>
<div class="wrap"><h1>${title}</h1><p>${detail}</p><p>${next}</p></div>
</body>
</html>`;
}
