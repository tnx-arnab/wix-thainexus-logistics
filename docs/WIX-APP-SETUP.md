# Wix App Dashboard setup

## Create app

1. Open [Wix App Dashboard](https://dev.wix.com/)
2. Create app → name **Thai Nexus Logistics** (or Thainexus Express)
3. Copy **App ID**, **App Secret**, and **Public key** (PEM) into `.env` / `.dev.vars`

## URLs (production)

| Setting | Value |
|---|---|
| App URL | `https://wix.thainexus.co.th` (Wix opens `/api/oauth/v1/authorize?token=…`) |
| Redirect URL | `https://wix.thainexus.co.th/api/oauth/v1/signup` |
| Dashboard Page | `https://wix.thainexus.co.th/` |

For local tunnel, replace the host with your ngrok/cloudflared URL.

## Extensions

### Dashboard Page

| Field | Value |
|--------|--------|
| **iFrame URL** | `https://wix.thainexus.co.th/` |
| **Relative route** | **Required.** e.g. `home` or `settings` (Wix rejects save if empty) |

Wix opens the iframe with an `instance` query param; the app resolves it after install.

If save shows **"Something went wrong"**: fill **Relative route**, confirm `https://wix.thainexus.co.th/` returns **200**, then retry or use another browser.

### eCom Shipping Rates (SPI)

| Field | Value |
|---|---|
| deploymentUri | `https://wix.thainexus.co.th/` (Wix appends `/v1/getRates`; official template uses `https://your-domain/api/shipping-rates` + same path) |
| name | Thai Nexus Express |
| description | Thai Nexus logistics rates at checkout |
| dashboardUrl | Dashboard page URL |
| fallbackDefinitionMandatory | `false` |

Implemented paths (any one may be used by Wix):

- `POST /v1/getRates` (recommended; matches [Wix custom shipping template](https://github.com/wix/app-template-custom-shipping-rates))
- `POST /plugins-and-webhooks/v1/getRates`
- `POST /getShippingRates`
- `POST /` with `Authorization: Bearer <signed JWT>` (deploymentUri root only)

Wix sends a **signed JWT** (`iss: wix.com`, `aud: your App ID`). Set **Public key** in env as `WIX_PUBLIC_KEY`. Checkout also needs the app **enabled under Shipping & Fulfillment → Installed apps** for the region.

### Webhooks

| Event | Endpoint |
|---|---|
| **eCommerce → Payment status updated** (preferred; PAID only) | `POST /api/webhooks/orders` |
| Order created (optional; only if you ship on create) | `POST /api/webhooks/orders` |
| App installed / removed / permissions | `POST /api/webhooks/app-lifecycle` |
| Privacy / redact (if required) | `POST /api/webhooks/privacy` |

## Permissions (least privilege)

In [Dev Center → your app → Permissions](https://dev.wix.com/apps): **Add Permissions**, save, then **Test app → reinstall** on the dev site and approve scopes (old installs keep the old token).

| Scope | Needed for |
|---|---|
| **Read products in v3 catalog** (`SCOPE.STORES.PRODUCT_READ…`) | Products tab + rates (V3 sites) |
| **Product write in v3 catalog** (`SCOPE.STORES.PRODUCT_WRITE…`) | Save L/W/H from Products tab (V3) |
| **Read Products** (V1, `WIX_STORES.READ_PRODUCTS`) | Optional: legacy Catalog V1 sites |
| **Manage Products** (V1) | Optional: legacy V1 product updates |
| **Read Orders** | Shipments / order webhooks |
| Shipping Rates SPI + Dashboard | Extensions (separate from this list) |

Optional shortcut: **Read Stores** includes Read Products.

## Checkout fails only with app installed

Wix calls **Shipping Rates SPI** during checkout. If Thai Nexus is the only carrier or SPI errors/time out, dev checkout can 404 or hang. Uninstalling removes those calls, so checkout works again.

**Safer approach (no uninstall):** Settings → Shipping → **Manage your apps** → leave **Free shipping ON**, turn **Thai Nexus Express OFF** until products are `readyForRates`, then turn it ON again.

SPI config: `fallbackDefinitionMandatory: false`.

## Local tunnel checklist

```bash
npm run dev
# terminal 2: cloudflared tunnel --url http://localhost:3001
# point App URL + SPI deploymentUri at the tunnel
# set WEBHOOK_SKIP_VERIFY=true only locally
```
