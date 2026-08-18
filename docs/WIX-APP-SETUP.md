# Wix App Dashboard setup

## OAuth (Easy OAuth)

1. Open [Wix App Dashboard](https://dev.wix.com/) → **Develop → OAuth**
2. Copy **App ID** and **App Secret**. Leave **Custom authentication (Legacy)** off.
3. Do not set App URL or Redirect URL. Wix installs the app inside Wix; we mint tokens with app ID, secret, and `instanceId`.
4. Copy **Public key** (PEM) — **not on the OAuth page**. Use either:
   - App **Home** → **More Actions** (⋯) → **View ID & keys** → Public key, or
   - **Develop → Webhooks** → **Get Public Key** ([Wix docs](https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/verify-requests-received-from-wix))
5. Put all three in `.env` / `.dev.vars` as `WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_PUBLIC_KEY`

Deploy this Worker **before** turning Custom authentication off. Existing sites keep working because we already have their `instanceId`.

## URLs (production)

| Setting | Value |
|---|---|
| OAuth | App ID + secret only (no App URL / Redirect URL) |
| Dashboard Page iframe | `https://wix.thainexus.co.th/` |
| App Instance Installed / Removed | `https://wix.thainexus.co.th/api/webhooks/app-lifecycle` |

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

Wix sends a **signed JWT** (`iss: wix.com`, `aud: your App ID`). Set **Public key** in env as `WIX_PUBLIC_KEY` (from **View ID & keys** or **Webhooks → Get Public Key**, not OAuth). For **REST webhooks**, the JWT is the **raw POST body** (not JSON); our API verifies it and reads `instanceId` from the envelope. Checkout also needs the app **enabled under Shipping & Fulfillment → Installed apps** for the region.

**Cash on delivery:** Subscribe **Order created** → `https://wix.thainexus.co.th/api/webhooks/orders` (Read Orders). Shipments run when the order is placed (`NOT_PAID` is OK). You can remove **Payment status updated** if you only use COD.

Same URL for both events; our handler verifies the JWT body (you do not need a separate `/webhook` path from the Wix SDK sample).

| Event | Endpoint |
|---|---|
| **eCommerce → Order created** (COD; `NOT_PAID` OK) | `POST /api/webhooks/orders` |
| **eCommerce → Payment status updated** (optional; PAID only) | `POST /api/webhooks/orders` |
| App installed / removed | `POST /api/webhooks/app-lifecycle` |
| Privacy / redact | `POST /api/webhooks/privacy` |

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

## Webhooks not firing (empty Wix **Logs** tab)

If **Subscriptions** shows your callback but **Logs** is empty, Wix has **not POSTed** yet (this is not an API bug).

1. **Release the app version** — adding a webhook creates a new **minor version**. Open **Distribute** (or **Release** in the app dashboard). If a version is pending, **release** it. Until then, installed sites may not get the new subscription.
2. **Update on the site** — Site owner → **Apps → Manage Apps** → **Update** on Thai Nexus if offered (required after some **major** releases).
3. **Wait up to ~10 minutes** after creating/editing the webhook (Wix banner).
4. **Trigger a test** — Webhooks → ⋮ on the row → **Edit callback URL** → **Trigger a test**. Wix requires **HTTP 200 within ~1.25s**; our handler acks immediately and creates shipments in the background. A **timeout** in Wix logs usually meant the old synchronous handler (redeploy fixes that).
5. **Past orders do not replay** — #10001 / #10002 will not webhook retroactively. Use dashboard **Shipments → Sync from Wix orders** after **Read Orders** is granted.
6. **New paid order** — place a test checkout after steps 1–4; `payment_status_updated` fires when status becomes **PAID**.

Confirm our side: open the app (logged in) → `GET /api/orders/webhook-status` should show `orderWebhookHits > 0` after a successful Wix delivery.

Optional shortcut: **Read Stores** includes Read Products.

## Checkout fails only with app installed

Wix calls **Shipping Rates SPI** during checkout. If Thai Nexus is the only carrier or SPI errors/time out, dev checkout can 404 or hang. Uninstalling removes those calls, so checkout works again.

**Safer approach (no uninstall):** Settings → Shipping → **Manage your apps** → leave **Free shipping ON**, turn **Thai Nexus Express OFF** until products are `readyForRates`, then turn it ON again.

SPI config: `fallbackDefinitionMandatory: false`.

**Checkout popup / region error:** Wix calls `getRates` again when you pick a delivery method. If that second call is **slow or empty**, the UI still shows old options but `set-delivery-method` fails (Wix shows a misleading **region** message). We keep a **120s checkout SPI cache** (same cart + address) so back-to-back calls return identical `code`s. Use a **new incognito cart** after deploy if options still look stale (~10 min Wix cache).

## Local tunnel checklist

```bash
npm run dev
# terminal 2: cloudflared tunnel --url http://localhost:8787
# point Dashboard iframe + SPI deploymentUri at the tunnel
# set WEBHOOK_SKIP_VERIFY=true only locally
```
