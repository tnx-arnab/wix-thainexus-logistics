# Deploy - Thai Nexus Wix

## Prerequisites

1. D1 database `thai-nexus-wix` on point@ - see [D1.md](./D1.md)
2. Wix App in [dev.wix.com](https://dev.wix.com/)
3. Cloudflare account + custom domain `wix.thainexus.co.th`
4. Fresh secrets: `JWT_KEY`, `ENCRYPTION_KEY` (do not reuse BC)

## Wix App Dashboard

| Setting | Value |
|---|---|
| App URL | `https://wix.thainexus.co.th/api/auth` |
| Redirect URL | `https://wix.thainexus.co.th/api/auth` |
| Dashboard Page | `https://wix.thainexus.co.th/` |
| SPI deploymentUri | `https://wix.thainexus.co.th/` |
| SPI name | Thai Nexus Express |

Permissions (least privilege): read products, read orders, shipping rates SPI, dashboard.

Webhooks: order paid (preferred) or created → `/api/webhooks/orders`; app lifecycle → `/api/webhooks/app-lifecycle`; privacy → `/api/webhooks/privacy`.

## Cloudflare

```bash
cp .env.example .dev.vars
# fill secrets
npm run cf:secrets
npm run cf:deploy
```

### Custom domain DNS (`wix.thainexus.co.th`)

**Test App** in Wix opens your **App URL** (`/api/auth`). If the browser shows `ERR_NAME_NOT_RESOLVED`, the hostname has no DNS yet (Worker deploy alone is not enough until the domain is attached).

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → account **point@thainexus.co.th** → zone **thainexus.co.th**
2. **Workers & Pages** → **thai-nexus-wix** → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → `wix.thainexus.co.th`  
   (This usually creates the DNS record automatically when the zone is on Cloudflare.)
3. **DNS** → **Records**: confirm a **`wix`** record exists (proxied orange cloud), same idea as **`bc`** for BigCommerce.
4. On your Mac, verify:

```bash
dig +short wix.thainexus.co.th A
curl -s https://wix.thainexus.co.th/health
```

If `dig` is empty, wait a few minutes or remove and re-add the custom domain on the Worker. Flush local DNS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`

Then set Wix OAuth / Dashboard / SPI / webhooks to `https://wix.thainexus.co.th` (not a trycloudflare URL).

## Verify

1. `GET https://wix.thainexus.co.th/health` → `d1.ok: true`
2. Install app → row in D1 `stores`
3. Open Dashboard → Settings save token + shipper
4. Checkout shows Thai Nexus Express rates
5. Paid order creates `order_shipments`
