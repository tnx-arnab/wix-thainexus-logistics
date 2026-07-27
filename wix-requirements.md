# Wix App Requirements
## Thai Nexus Logistics (Wix)

> **Source:** Extracted from the BigCommerce app (`docs/requirements.md`, `docs/IMPLEMENTATION_PLAN.md`, admin UI, `shared/`, `api/`) and aligned with the Shopify port pattern (`docs/shopify-requirements.md`).  
> **Goal:** Same product on Wix - checkout rates, merchant settings, shipments, fees, boxes, service toggles.  
> **Production domain:** `https://wix.thainexus.co.th`  
> **Project / folder / git repo:** **new separate repo** (do not share BC Worker, OAuth secrets, or production Supabase).  
> **BC reference domain (do not reuse):** `https://bc.thainexus.co.th`  
> **Shopify reference domain (do not reuse):** `https://shopify.thainexus.co.th`

---

## 0. Project setup (start here)

### 0.1 New repository

Create a **new git repo** (sibling of `thai-nexus-app`, not a fork that keeps BC glue as default):

Suggested name: `thai-nexus-wix` (or `Thainexus Express Wix`).

Suggested monorepo layout (mirror BC for reuse):

```
thai-nexus-wix/
  admin/          # Vite + React dashboard UI (embedded in Wix Dashboard)
  api/            # Express / Worker API + Wix OAuth + Shipping Rates SPI
  shared/         # Packing, commission, rates, Thai Nexus client, crypto
  supabase/       # Schema for Wix tenants (separate project)
  docs/           # This requirements file + deploy notes
  wrangler.jsonc  # Cloudflare Worker (optional; same pattern as BC)
  package.json    # npm workspaces
```

Copy these BC reference files into the new repo as living specs (then adapt paths):

- `docs/wix-requirements.md` (this file - become the Wix repo README/spec)
- `admin/src/index.css`, `admin/tailwind.config.js` (style tokens)
- `shared/src/types/thaiNexus.ts`, `rateEligibility.ts`, `packing.ts`, `commission.ts`

### 0.2 What to copy vs rewrite

| Copy / reuse from BC repo | Rewrite for Wix |
|---|---|
| `shared/src/packing.ts` | OAuth + install / uninstall |
| `shared/src/commission.ts` | Session / Dashboard auth |
| `shared/src/currency.ts` | Shipping Rates SPI adapter |
| `shared/src/quoteCache.ts` | Order + lifecycle webhooks |
| `shared/src/rateEligibility.ts` | Product search / flags (Wix catalog) |
| `shared/src/thaiNexus/*` (client, rates) | BC-only routes (`/api/rate`, `/api/load`, carrier schema) |
| `shared/src/crypto.ts` + config types | BC shipping setup bootstrap |
| Admin page UX + `tnxl-*` CSS | BC product extension iframe |
| Supabase patterns + encryption | |

### 0.3 Separate database (required)

Use a **new Supabase project** (or at least a dedicated schema). Do **not** point Wix production at the BC `stores` / tokens.

- Tenant key: Wix **`instanceId`** (primary) + optional `siteId` / `metaSiteId` for display
- Keep JSON config shape identical (`thai_nexus_config.data`)
- Keep `order_shipments`, `debug_logs`, `install_logs`
- Use a **new** `ENCRYPTION_KEY` (never reuse BC key)

### 0.4 Recommended kickoff path

1. Create Wix app in [Wix App Dashboard](https://dev.wix.com/)
2. Scaffold from Wix **self-hosted custom shipping rates** tutorial / template (OAuth + SPI + dashboard page)
3. Drop `shared/` rate engine into `getShippingRates`
4. Port admin tabs (with style tokens from §7) and Supabase config APIs
5. Wire order webhook → `shipmentCrud`
6. Deploy to `wix.thainexus.co.th`

Official tutorial:  
https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app

Shipping Rates SPI:  
https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction

---

## 1. Product identity

| Item | BigCommerce (current) | Wix (target) |
|---|---|---|
| App display name | Thai Nexus Logistics | **Thai Nexus Logistics** (or **Thainexus Express** if matching Shopify brand - pick one before App Market listing) |
| Carrier / checkout label | Thai Nexus Express | **Thai Nexus Express** (shopper-facing) |
| Carrier internal code | `thainexus` | **`thainexus`** (reuse) |
| Public app host | `bc.thainexus.co.th` | **`wix.thainexus.co.th`** |
| Git repo | `thai-nexus-app` | **New repo** (`thai-nexus-wix`) |
| Database | BC Supabase project | **New Supabase project** |
| Thai Nexus backend | `https://app.thainexus.co.th/functions/` | **Unchanged** |

**Decision required before build:** final App Market display name (Logistics vs Express). Keep shopper-facing carrier label as **Thai Nexus Express** either way.

---

## 2. Feature parity (what to port)

### 2.1 Merchant admin UI (embedded dashboard)

Port the same tabbed React admin shell (Vite + Tailwind + `tnxl-*` classes). Replace BC `?context=` JWT with **Wix Dashboard SDK** session (and/or instance token exchange on your API). Follow **§7 UI / style guide** exactly.

| Tab order | Purpose | BC implementation | Wix notes |
|---|---|---|---|
| 1. **Shipments** | List + detail from Thai Nexus | `ShipmentsPage.tsx` | Same `shipmentCrud` |
| 2. **Settings** | Token, test, shipper, courier toggles, ineligible products, boxed guide | `SettingsPage.tsx` | Tenant = `instanceId` |
| 3. **Fees** | Commission / markup rules | `FeesPage.tsx` | Product search → Wix Products API |
| 4. **Boxes** | Packing box definitions (cm, kg) | `BoxesPage.tsx` | Identical logic (`shared/packing.ts`) |
| 5. **Privacy** | Data-use disclosure | `PrivacyPage.tsx` | Update copy: Supabase + Wix (not BC/Firestore) |
| 6. **Debug** (gated) | Checkout rate traces, clear cache | `DebugPage.tsx` | Only when `debugEnabled` |

Tab icons (Lucide): `LayoutDashboard` (Shipments), `Settings`, `DollarSign`, `Package`, `Shield`, `Bug`.

**Bootstrap / error states (must implement):**

| State | UX |
|---|---|
| Loading session | Full-page spinner + "Connecting to your store…" |
| Loading config | `tnxl-skeleton` placeholders in card |
| No session / open outside Dashboard | Message: open from **Wix Dashboard → Apps → Thai Nexus** (not bookmark) |
| Store not linked (`STORE_NOT_LINKED`) | Install / reconnect CTA button |
| API / health failure | Red banner; link to `/health` and install diagnostics / OAuth logs |
| Config save success | Primary-tint banner (not generic green) |
| Config save / validation error | `bg-red-50 text-secondary` banner |

**Header branding:**

- Title: `text-3xl font-bold text-primary` + Package icon `text-secondary w-8 h-8`
- Subtitle: "Manage shipping API settings and store origin."
- Show tenant id under subtitle: `Instance: {instanceId}` (same pattern as BC `storeHash`)

Optional: Wix Design System only for Dashboard chrome; keep existing Tailwind/`tnxl-*` forms for parity.

### 2.2 Checkout - real-time shipping rates

| Capability | BC | Wix |
|---|---|---|
| Platform contract | [Shipping Provider API](https://developer.bigcommerce.com/docs/integrations/shipping-provider) | [eCom Shipping Rates Service Plugin (SPI)](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction) |
| Rate endpoint | `POST /api/rate` | SPI handler `getShippingRates` (path from Wix template / App Dashboard `deploymentUri`) |
| Auth of rate calls | App responsibility | Wix SPI verification via `@wix/sdk` + app public key |
| Connection test (platform) | `POST /api/check_connection_options` | Not required - use admin `POST /api/shipping/check-connection` |
| Connection test (admin) | Must hit **real** Thai Nexus | **Reuse** |
| On rate errors | Always HTTP 200 + empty quotes + messages | Return empty `shippingRates` + write `debug_logs` (never 5xx) |
| Quote cache | Internal + BC `ttl` | Internal only (`quoteCache.ts`, 1h TTL) |

**Internal rate pipeline (100% reusable in `shared/`):**

1. Normalize cart items (weight, dimensions, price)
2. Run `validateRateRequest` preflight (destination, measurements, store ready, eligibility) - on fail return empty rates + INFO message
3. Resolve **document** and **boxed** flags per product
4. Merge eligibility: per-product flag `false` **or** id in `shippingIneligibleProductIds` → ineligible (`mergeShippingEligibleFlags`)
5. If any line ineligible → hide **all** Thai Nexus rates
6. **Pack** cart into boxes (`packing.ts` + merchant `boxes[]`); retail boxing exception when single boxed product line
7. For each packed box → `apiQuote` → Thai Nexus (timeout default **7000ms**)
8. **Merge** couriers present on **all** boxes (`count === boxCount`)
9. Filter out `disabledServiceIds` (normalize ids: trim, spaces→`_`, lowercase)
10. Apply **commission rules** in THB (`calculateTotalCommission`)
11. Convert THB → site currency via Frankfurter (`currency.ts`, 1h cache; FX failure → empty rates)
12. Round money to 2 decimals
13. Return Wix-formatted `shippingRates[]`

Do **not** invent BC-style zone `service_levels` filters unless product explicitly needs them; BC production path is app-managed toggles (`disabledServiceIds`) only.

### 2.3 Post-checkout - auto shipments

| Capability | BC | Wix |
|---|---|---|
| Trigger | Webhook `store/order/created` | Wix eCom order event - prefer **order paid** if unpaid drafts exist; else created |
| Endpoint | `POST /api/webhooks/orders` | `POST /api/webhooks/orders` |
| Signature | `x-bc-signature` | Wix webhook JWT / public-key verify (Wix SDK) |
| Condition | Thai Nexus shipping method | Rate code/title contains `thainexus` / `Thai Nexus`, **or** matches live courier display names from `apiShippingServices` |
| Action | Pack order → `shipmentCrud` create per box | **Same** (shipment timeout default **15000ms**) |
| Storage | `order_shipments` | Key by `instance_id`; `order_id` as **text** |

**Webhook handler rules (must match BC):**

- Always respond HTTP **200** even on business skips (`{ received: true, ok: false, reason }`) so Wix does not storm retries
- Skip reasons to log: `already-created`, `no-token`, `ineligible-products`, `not-thai-nexus-method`, `store-not-ready`
- Idempotent: resume partial creates; complete only when every packed box has `request_number`
- Verify signatures in production; `WEBHOOK_SKIP_VERIFY` local-only

Lifecycle webhooks:

| Event | Purpose |
|---|---|
| App installed | Upsert `stores`; bootstrap SPI/webhooks |
| App removed / uninstalled | Delete OAuth tokens / `stores` row only; **preserve** `thai_nexus_config` (and do not wipe shipments/debug unless GDPR) |
| Permissions updated | Refresh scopes / re-auth if needed |

### 2.4 Product flags (document / boxed / eligible)

Three **independent** flags (BC has all three - Wix v1 must cover behavior even if storage differs):

| Flag | Default | Effect |
|---|---|---|
| **Shipping eligible** | Eligible (on) | Explicit false **or** id in `shippingIneligibleProductIds` → hide all rates if any cart line matches |
| **Is boxed?** | Off (`0`) | Only value `"1"` / true = boxed. Retail dims used **only** when cart is a **single** boxed product line; mixed carts use packing boxes |
| **Document shipment** | Off | Any document line → `is_document: true` on `apiQuote` for that box |

| Item | BC | Wix v1 |
|---|---|---|
| Document storage | Metafield `thai_nexus.is_document` | App DB `(instance_id, product_id)` and/or Wix product extended fields |
| Boxed storage | Custom field `Boxed Product` (`1`/`0`) + sync to metafield | App DB or Wix extended field; value rule same as BC |
| Eligible storage | Metafield + Settings bulk list | Settings bulk list required; per-product optional |
| Admin UI | Product extension iframe + Settings | Settings bulk picker + boxed **informational guide**; optional product panel later |
| API | `GET/PUT /api/products/:id/flags`, `/document-flag` | **Reuse** route shapes; swap catalog client |

**Boxed Product guide copy** (adapt platform steps; keep value rules). Source: `admin/src/lib/boxedProductField.ts`:

- Title: "How it works"
- Intro: merchant only changes the value per product; they do not invent the field name
- Steps: open product → set Boxed Product to `1` for retail box; leave `0` for normal packing; any value other than `1` counts as `0`
- Note: when `1`, Thai Nexus quotes using that product's weight/dims **only if it is the only product in the cart**; mixed carts use packing boxes

**Wix copy change:** replace BC "Custom fields in the left sidebar" with the Wix product editor path (or "managed in Thai Nexus Settings / product panel").

### 2.5 Auth & install

| Capability | BC | Wix |
|---|---|---|
| OAuth | BC → `/api/auth` | Wix OAuth (App URL + Redirect URL) |
| Load / embed | `/api/load` → JWT `?context=` | Dashboard Page extension + Dashboard SDK |
| Uninstall | `/api/uninstall` | App removed webhook - revoke tokens only |
| User removed | `/api/remove-user` | Remove dashboard user mapping if stored; do not wipe config |
| Session for admin API | JWT `context` query param | Dashboard access token → backend resolves `instanceId` |
| Diagnostics | `/api/setup`, `/api/setup/logs` | Port with Wix checks |

Session response for admin bootstrap must include: `instanceId`, `debugEnabled`, public config (`hasApiToken`, shipper, rules, boxes, services toggles, ineligible ids).

Post-install bootstrap (Wix equivalent of BC `shippingSetup.ts`):

1. Confirm Shipping Rates SPI extension is active for the site
2. Register order + lifecycle webhooks
3. Ensure storage for product flags (app DB tables and/or Wix extended fields)
4. Write `install_logs` on success/failure
5. Do **not** call BC carrier / zone / method / metafield GraphQL APIs

---

## 3. Admin UI - field-level spec

### 3.1 Settings tab

#### 3.1.1 API Authentication card (`bg-secondary` header)

| Field / control | Behavior |
|---|---|
| API token | Write-only; never returned after save |
| Token on file | Show "Token saved" mask + Replace / Cancel; mono masked dots |
| Test connection | Uses typed token **or** on-file token; does **not** persist |
| Amber callout | "Test connection does not save. Click Save settings to persist." |
| Save | Sticky bottom bar; persists encrypted token + shipper + services + ineligible list |

**Save payload rule:** Settings save must **re-send** current `commissionRules` + `boxes` from loaded config so a partial PUT cannot wipe Fees/Boxes (BC `SettingsPage.tsx` pattern).

#### 3.1.2 Shipping Services card (`bg-secondary` header)

| Control | Behavior |
|---|---|
| Load services | `GET /api/shipping/services` only when `hasApiToken` |
| Toggle | Checkbox per service; logo or Truck fallback |
| Select all / Deselect all | Required |
| Badge | "{n} enabled" |
| Persist | Unchecked ids → `disabledServiceIds[]` |
| Id normalize | `trim` → spaces to `_` → lowercase (must match rate filter) |
| Empty / missing list | All services enabled |

#### 3.1.3 Product shipping eligibility card (`bg-primary` header)

| Control | Behavior |
|---|---|
| Default | All products eligible |
| Multi-select | `ProductSearchSelect` search |
| Persist | `shippingIneligibleProductIds[]` |
| Copy | Any excluded line in cart hides **all** Thai Nexus rates |
| Already excluded | Show selected chips / "Already excluded" state |

#### 3.1.4 Boxed Product guide card (`bg-primary` header)

Informational only (no save fields). Port guide from `BOXED_PRODUCT_FIELD_GUIDE`; rewrite steps for Wix product editor.

#### 3.1.5 Shipper / origin card (`bg-secondary` header)

| Field | Key | Validation message |
|---|---|---|
| Name | `shipper.name` | `Shipper name is required.` |
| Phone | `shipper.phone` | `Phone number is required.` |
| Street | `shipper.street` | `Street address is required.` |
| City | `shipper.city` | `City is required.` |
| State | `shipper.state` | optional |
| Postal code | `shipper.postalCode` | `Postal code is required.` |
| Country | `shipper.country` | `Country must be a 2-letter code (e.g. TH).` |

Country UI options (BC select): **TH, US, GB, AU, SG** (default `TH`). Free-type 2-letter still allowed if validation passes.

Validation helper: `validateShipperForm()` - reuse.

### 3.2 Fees tab (commission rules)

| Field | Key | Notes |
|---|---|---|
| Rule ID | `commissionRules[].id` | e.g. `rule_${timestamp}` |
| Condition type | `conditionType` | `subtotal_range` \| `specific_products` |
| Min subtotal (THB) | `minRange` | subtotal_range only |
| Max subtotal (THB) | `maxRange` | `0` = no upper cap |
| Product IDs | `specificProducts[]` | Normalize Wix product ids to string in API; keep array consistent |
| Fee type | `feeType` | `fixed` \| `percentage` |
| Fee value | `feeValue` | THB or % |
| Fee label | `feeLabel` | optional checkout label |
| Currency display | `currencySymbol` | from site (default `฿`) |

Rules with `feeValue <= 0` are dropped on save. Requires shipper complete before meaningful checkout use (same as Boxes).

### 3.3 Boxes tab

| Field | Key | Notes |
|---|---|---|
| Box ID | `boxes[].id` | e.g. `box_${timestamp}` |
| Name | `name` | required |
| Inner length / width / depth | `innerLengthCm` etc. | cm, positive |
| Max weight | `maxWeightKg` | kg, positive |
| Empty box weight | `emptyWeightKg` | kg; included in quoted weight |

Requires complete shipper profile before save. At least one usable box required for rates unless retail boxing applies.

### 3.4 Shipments tab

- Paginated list: `page`, `limit` default **10**, max **50**
- Columns: request number, status, dates, addresses
- Detail modal: full shipment payload
- Auth errors → prompt to fix API token in Settings

### 3.5 Debug tab (when enabled)

Enable when `DEBUG_MODE=true|1` **or** `NODE_ENV !== 'production'`. Production must set `NODE_ENV=production` and `DEBUG_MODE=false`.

- List last **50** `debug_logs` / rate traces for instance
- Show: products, boxes, destination, upstream calls, final quotes, preflight messages
- Actions: clear logs, clear quote cache; auto-refresh ~5s optional
- BC checkout Script Manager debug helper is **out of scope** for Wix (omit)

Install logs: keep last **100** in `install_logs` (diagnostics page / setup logs).

### 3.6 Privacy tab

Static copy must list real processors (do not mention Firebase/Firestore):

- **Supabase** - config, shipment refs, debug / install logs
- **Wix** - OAuth, catalog, orders, dashboard
- **Thai Nexus** (`app.thainexus.co.th`) - rate + shipment APIs
- **Frankfurter** (`api.frankfurter.app`) - FX for non-THB sites
- Token is encrypted at rest; never returned to the browser after save

See also §5.7 GDPR / data deletion.

---

## 4. Reusable keys & constants

### 4.1 Environment variables

| Variable | Reuse? | Purpose | Default / notes |
|---|---|---|---|
| `APP_URL` | Yes | `https://wix.thainexus.co.th` | |
| `AUTH_CALLBACK` | Yes | OAuth redirect | Confirm path with Wix template |
| `SUPABASE_URL` | Yes | **New** Wix project | |
| `SUPABASE_SECRET_KEY` | Yes | Service role | Never ship to admin bundle |
| `JWT_KEY` | Yes | Optional app session JWT | New secret |
| `ENCRYPTION_KEY` | Yes | Encrypt `apiToken` | **New**; 32-byte material |
| `THAI_NEXUS_FUNCTIONS_URL` | Yes | Functions base | `https://app.thainexus.co.th/functions/` |
| `THAI_NEXUS_TIMEOUT_MS` | Yes | Quote / services timeout | **7000** |
| `THAI_NEXUS_SHIPMENT_TIMEOUT_MS` | Yes | `shipmentCrud` timeout | **15000** |
| `DEBUG_MODE` | Yes | Debug tab + traces | `false` in prod |
| `NODE_ENV` | Yes | Gates debug with DEBUG_MODE | `production` in prod |
| `API_PORT` / `ADMIN_DEV_URL` | Yes | Local | |
| `WIX_APP_ID` | New | App ID | |
| `WIX_APP_SECRET` | New | Token exchange | |
| `WIX_PUBLIC_KEY` | New | SPI / webhook verify PEM | |
| `CLIENT_ID` / `CLIENT_SECRET` | Drop | BC-only | |
| `BC_APP_ID` / `BC_CARRIER_ID` | Drop | BC-only | |
| `WEBHOOK_SKIP_VERIFY` | Adapt | Local only | Never in prod |

### 4.2 Carrier & service constants

```ts
CARRIER_CODE = 'thainexus'
CARRIER_DISPLAY_NAME = 'Thai Nexus Express'
DEFAULT_QUOTE_TTL_SECONDS = 3600 // internal cache only
```

### 4.3 Merchant connection options

| Key | Type | Purpose |
|---|---|---|
| `api_token` | string, secret | `apiQuote` / `shipmentCrud` / services |
| `sandbox` | boolean | Reserved; not implemented until Thai Nexus supports |

### 4.4 Service filter keys

| Key | Type | Purpose |
|---|---|---|
| `disabledServiceIds` | string[] | Merchant toggles in Settings (primary filter) |
| `service_levels` | optional | Do not implement for Wix v1 unless product asks |

Normalize service ids before compare: trim, whitespace → `_`, lowercase.

### 4.5 Product flag keys

| Store | Key | Type | Purpose |
|---|---|---|---|
| app DB / extended field | `is_document` | boolean | Document quote flag |
| app DB / extended field | `is_boxed` / Boxed Product | `"1"` / `"0"` | Retail boxing |
| app DB / metafield equiv | `shipping_eligible` | boolean | Default true; false opts out |
| config JSON | `shippingIneligibleProductIds` | id[] | Bulk opt-out |

### 4.6 Thai Nexus Cloud Functions

| Function | Purpose |
|---|---|
| `apiQuote` | Per-box rate quote |
| `apiShippingServices` | Courier list for Settings toggles |
| `shipmentCrud` | `list` \| `get` \| `create` |
| connection test | Via client / services call with token |

`apiQuote` body keys: `api_token`, `country`, `state`, `postcode`, `city`, `actual_weight_kg`, `length_cm`, `width_cm`, `height_cm`, `is_document`.

### 4.7 Store config JSON shape

```ts
interface StoreConfig {
  apiTokenEncrypted?: string;
  shipper: ShipperProfile;
  commissionRules: CommissionRule[];
  boxes: ShippingBox[];
  disabledServiceIds?: string[];
  shippingIneligibleProductIds?: Array<string | number>;
  updatedAt?: string;
  markup?: MarkupRule; // legacy only
}
```

Public response (`StoreConfigPublic`): `hasApiToken`, `shipper`, `commissionRules`, `boxes`, `disabledServiceIds`, `shippingIneligibleProductIds`, `currencySymbol`, `updatedAt`, `debugEnabled`, `instanceId`.

### 4.8 Supabase tables (Wix schema)

| Table | PK / tenant | Notes |
|---|---|---|
| `stores` | `instance_id` | `access_token`, `refresh_token`, `scope`, optional `site_id` |
| `store_users` | optional | Only if multi-user mapping needed |
| `thai_nexus_config` | `instance_id` | JSONB `data` |
| `order_shipments` | id + `instance_id` | `order_id` **text** |
| `debug_logs` | id + `instance_id` | Cap ~50 per instance in app logic |
| `install_logs` | id + `instance_id` | Cap ~100 |
| `product_flags` (recommended) | `(instance_id, product_id)` | `is_document`, `is_boxed`, `shipping_eligible` |

Enable RLS; API uses service role only.

### 4.9 Admin / platform API routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness + Supabase probe |
| GET/POST | `/api/auth` (+ OAuth routes) | Wix | Install / token exchange |
| GET | `/api/session` | session | Bootstrap instance + `debugEnabled` |
| GET/PUT | `/api/config` | session | Merchant config |
| POST | `/api/shipping/check-connection` | session | Real Thai Nexus token test |
| GET | `/api/shipping/services` | session | Courier toggles |
| SPI | `getShippingRates` | Wix SPI | Checkout rates |
| GET | `/api/shipments` | session | List (`limit` default 10, max 50) |
| GET | `/api/shipments/:requestNumber` | session | Detail |
| GET | `/api/products/search?q=` | session | Picker (cap ~250) |
| GET | `/api/products/by-ids` | session | Resolve selected ids |
| GET/PUT | `/api/products/:id/flags` | session | document / boxed / eligible |
| GET/PUT | `/api/products/:id/document-flag` | session | Document only (compat) |
| GET/DELETE | `/api/debug` | session + debug | Logs |
| DELETE | `/api/debug/cache` | session + debug | Quote cache |
| GET | `/api/setup`, `/api/setup/logs` | session | Diagnostics |
| POST | `/api/webhooks/orders` | Wix verify | Auto shipments |
| POST | `/api/webhooks/app-lifecycle` | Wix verify | Install / remove / permissions |
| POST | `/api/webhooks/privacy` (if required) | Wix verify | GDPR / data requests |

**Drop BC-only:** `/api/rate`, `/api/check_connection_options`, `/api/carrier-schema`, `/api/load`, BC uninstall/remove-user shapes, BC shipping zone bootstrap, BC Script Manager checkout debug.

---

## 5. Wix platform requirements (delta from BC)

### 5.1 HTTPS & hosting

- Domain: `wix.thainexus.co.th` (Cloudflare Workers preferred; mirror BC `wrangler.jsonc`)
- Valid CA TLS, port 443 only
- Route `/api/*`, SPI paths, `/health` before SPA assets
- Dashboard Page URL → embedded admin

### 5.2 App Dashboard extensions

| Extension | Purpose |
|---|---|
| **Dashboard Page** | Shipments / Settings / Fees / Boxes / Privacy / Debug |
| **eCom Shipping Rates** | SPI `deploymentUri` |
| **Webhooks** | Orders + lifecycle (+ privacy if App Market requires) |

SPI fields:

| Field | Value |
|---|---|
| `deploymentUri` | `https://wix.thainexus.co.th/` (or template base) |
| `name` | `Thai Nexus Express` |
| `description` | Thai Nexus logistics rates at checkout |
| `dashboardUrl` | Dashboard extension URL |
| `fallbackDefinitionMandatory` | `false` |

### 5.3 Shipping Rates SPI contract

```ts
import { createClient } from '@wix/sdk';
import { shippingRates } from '@wix/ecom/service-plugins';

const wixClient = createClient({
  auth: {
    appId: process.env.WIX_APP_ID!,
    publicKey: process.env.WIX_PUBLIC_KEY!,
  },
  modules: { shippingRates },
});

wixClient.shippingRates.provideHandlers({
  getShippingRates: async (payload) => {
    const { request, metadata } = payload;
    // resolve instanceId → load config → adapt → calculateRates → map response
    return { shippingRates: [...] };
  },
});
```

**Adapter:** `api/src/wix/wixShippingRatesAdapter.ts`

- Map Wix line items / destination → internal rate DTO (neutral `RateRequest` preferred over keeping `BcRateRequest` name)
- Map internal quotes → current Wix SPI rate fields (`code`, `title`, `cost`, currency, logistics, etc.)
- Map preflight / packing messages into SPI-allowed message fields if any; else debug_logs only

**Hard rules:**

- Do **not** call Wix Estimate Cart / Get Checkout from inside `getShippingRates`
- Never 5xx on upstream/business failures
- Log every rate attempt when debug enabled; always log failures useful for support

### 5.4 OAuth & permissions (minimum)

Least privilege; finalize against Wix permission names during impl:

- Read products / catalog
- Read orders (and create shipment-side effects as needed)
- Shipping rates SPI (extension)
- Dashboard page access

Store access + refresh tokens on `stores.instance_id`. Refresh before expiry.

### 5.5 Embedded app URLs

| Setting | Value |
|---|---|
| App URL | `https://wix.thainexus.co.th/` |
| Redirect URL(s) | OAuth callback (confirm with template) |
| Dashboard Page URL | Admin SPA |
| SPI deployment URI | Shipping Rates base |

### 5.6 Local development

- `npm run dev` → API + Vite admin
- Tunnel (ngrok / Cloudflare) for OAuth + SPI
- Point App Dashboard URLs at tunnel
- `WEBHOOK_SKIP_VERIFY` only local

### 5.7 GDPR / privacy / data deletion

Wix App Market may require privacy webhooks or a documented deletion process (mirror Shopify `customers/data_request`, `customers/redact`, `shop/redact` intent).

| Event | Action |
|---|---|
| App uninstall | Delete `stores` tokens only; **keep** `thai_nexus_config` for reinstall |
| Site / shop redact (if required) | Delete `stores`, `thai_nexus_config`, `order_shipments`, `debug_logs`, `install_logs`, `product_flags` for that `instance_id` |
| Customer redact (if required) | Scrub PII from shipment payloads / logs if stored; prefer not storing shopper PII beyond Thai Nexus upstream needs |

Document retention in Privacy tab. Do not store raw API tokens in logs.

---

## 6. Rate calculation - shared business rules (do not change)

| Rule | Implementation |
|---|---|
| Preflight | `validateRateRequest` - destination country/zip/city; every line weight+dims; product id present; token+shipper; boxes unless retail boxing |
| Ineligible product | Any ineligible line → **no** Thai Nexus rates (INFO message) |
| Retail boxing | Single-line cart + boxed=`1` → quote product dims; skip box requirement |
| Multi-box merge | Courier kept only if present for **every** box |
| Disabled services | Filter after merge via normalized `disabledServiceIds` |
| Commission | Applied in THB before FX |
| Currency | Frankfurter; 1h cache; failure → empty rates |
| Document | Any document line on box → `is_document` true |
| Packing | Include `emptyWeightKg`; coerce string dims to numbers |
| Quote cache | In-process Map, 1h TTL, key = instance + payload; clearable from Debug |
| Timeouts | Quote/services 7000ms; shipment 15000ms (env override) |
| Checkout errors | Empty rates + human message / debug log - never hard 5xx |
| Order shipment detection | Title/code contains `thai nexus` / `thainexus` or live courier name match |

---

## 7. UI / style guide (required)

Port the BC admin look. Source of truth: `admin/tailwind.config.js`, `admin/src/index.css`, `admin/src/App.tsx`, `SettingsPage.tsx`.

### 7.1 Brand colors

```js
// tailwind.config.js
colors: {
  primary: { DEFAULT: '#272262', hover: '#1e1a4d' },   // navy - titles, active tabs, primary buttons
  secondary: { DEFAULT: '#bf1d2d', hover: '#9f1824' }, // crimson - section headers (API), errors, test actions
}
```

| Token | Hex | Use |
|---|---|---|
| primary | `#272262` | Headings, active tab, primary button, eligibility/boxed headers |
| primary-hover | `#1e1a4d` | Primary button hover |
| secondary | `#bf1d2d` | API/services/shipper headers, errors, Package icon accent |
| secondary-hover | `#9f1824` | Secondary button hover |
| page bg | `#f9fafb` | `body` background |
| success tint | `#272262` at 5% opacity (`bg-[#272262]/5`) | Success banners - **not** generic green |
| error surface | `bg-red-50 text-secondary border-red-100` | Errors |
| warn callout | `border-l-amber-500 bg-amber-50 text-amber-950` | "Test ≠ save" and similar |

### 7.2 Component classes (`admin/src/index.css`)

Copy these utilities into the Wix admin:

| Class | Role |
|---|---|
| `tnxl-card` | White card, `rounded-xl`, light border/shadow, `p-6` |
| `tnxl-input` | Full-width input, gray border, primary focus ring |
| `tnxl-btn-primary` | Navy button |
| `tnxl-btn-secondary` | Crimson button (Test connection, etc.) |
| `tnxl-skeleton` | Shimmer bar (`from-gray-100 via-secondary/30`) |
| `tnxl-slide-in` | 0.25s enter animation for banners |

### 7.3 Layout shell

- Page: `min-h-screen p-6 md:p-10 max-w-7xl mx-auto font-sans`
- Font: Tailwind / system **sans only** - do not add Inter/Roboto/Arial as a brand font
- Header row: title left, pill tab bar right
- Tab bar container: `bg-white p-1 rounded-xl shadow-sm border border-gray-100`
- Active tab: `bg-primary text-white shadow-md`
- Inactive tab: `text-gray-600 hover:bg-gray-50`
- Labels: `text-sm font-semibold text-gray-700`
- Token / codes: `font-mono`

### 7.4 Section cards (Settings / Fees / Boxes)

Pattern:

1. Colored header bar (`bg-secondary` or `bg-primary`) with white title + optional `bg-white/20` badge pill
2. White body (`p-6` / `p-8`)
3. Sticky save bar: `sticky bottom-4 bg-white/95 backdrop-blur` with primary Save button

Header color mapping:

| Section | Header |
|---|---|
| API Authentication | `bg-secondary` |
| Shipping Services | `bg-secondary` |
| Shipper / origin | `bg-secondary` |
| Product shipping eligibility | `bg-primary` |
| Boxed Product guide | `bg-primary` |
| Fees / Boxes main headers | Match BC pages (`FeesPage` / `BoxesPage`) |

### 7.5 Feedback & loading

| Kind | Pattern |
|---|---|
| Full-page load | Spinner `border-primary` + "Connecting to your store…" |
| Settings load | Centered `Loader2` + "Loading your settings…" |
| Inline busy | `Loader2` on buttons |
| Success | Primary tint box + CheckCircle2 |
| Error | Red surface + AlertCircle `text-secondary` |
| Important note | Amber left-border callout |

### 7.6 Icons

Lucide React only. Tab set listed in §2.1. Settings also uses `Key`, `Wifi`, `Truck`, `MapPin`, `User`, `Phone`, `Save`, `Pencil`, `Info`, etc.

### 7.7 Motion

Keep subtle: tab transitions, `tnxl-slide-in` for toasts/banners, skeleton pulse. No purple glow, no emoji, no heavy multi-shadow stacks.

### 7.8 Wix Design System

Allowed for outer Dashboard iframe chrome if required by Wix. **Do not** replace inner Thai Nexus forms with a different color system - brand navy/crimson must remain.

---

## 8. Implementation checklist

### Infrastructure
- [ ] New git repo `thai-nexus-wix` with `admin` / `api` / `shared` / `supabase`
- [ ] New Supabase project + schema keyed by `instance_id` (+ optional `product_flags`)
- [ ] Cloudflare Worker (or Node) + `wix.thainexus.co.th`
- [ ] Secrets: Wix app keys, `JWT_KEY`, **new** `ENCRYPTION_KEY`, Supabase
- [ ] DNS + TLS
- [ ] Copy `tnxl-*` CSS + Tailwind color tokens

### Wix app setup
- [ ] App created; final display name decided
- [ ] OAuth App URL + Redirect URL
- [ ] Dashboard Page extension
- [ ] eCom Shipping Rates SPI (`deploymentUri`)
- [ ] Webhooks: lifecycle + orders (+ privacy if required)
- [ ] Permissions least-privilege review

### Port from BC repo
- [ ] `shared/` packing, commission, currency, quote cache, rateEligibility, Thai Nexus client/rates, crypto, types
- [ ] `admin/` pages + style guide; Wix Dashboard session instead of BC context
- [ ] Settings: token mask/replace, test≠save, services toggles, ineligible products, boxed guide, shipper validation, sticky save, preserve fees/boxes on save
- [ ] Wix OAuth + token persistence
- [ ] `wixShippingRatesAdapter` + `getShippingRates`
- [ ] Order webhook with always-200 + idempotent creates
- [ ] Privacy copy + GDPR deletion matrix
- [ ] Drop BC carrier/zone/metafield/Script Manager code

### Verification
- [ ] `GET /health` → Supabase ok
- [ ] Install → `stores` row; UI matches navy/crimson style guide
- [ ] Settings: save token + shipper; test does not save; toggles + ineligible work
- [ ] Fees + boxes persist and appear in rate debug
- [ ] Checkout shows Thai Nexus Express rates; ineligible product hides rates
- [ ] Single boxed product uses retail dims; mixed cart uses boxes
- [ ] Paid/created order creates shipments + `order_shipments`
- [ ] Uninstall revokes tokens; config survives reinstall
- [ ] Debug tab only when non-prod / DEBUG_MODE
- [ ] GDPR redact path wipes tenant data when required

---

## 9. BC → Wix quick mapping

| BigCommerce | Wix |
|---|---|
| `store_hash` | `instance_id` |
| `?context=` JWT | Dashboard SDK / instance access token |
| Shipping Provider `POST /api/rate` | Shipping Rates SPI `getShippingRates` |
| `connection_options.api_token` | Encrypted app config token |
| Zone `service_levels` | Not used in v1; use `disabledServiceIds` |
| `x-bc-signature` | Wix SPI / webhook public-key verify |
| Product metafield / custom field | App DB `product_flags` and/or Wix extended fields |
| Product app extension iframe | Settings guide + optional product panel |
| BC shipping zones / carrier setup | SPI extension registration only |
| Script Manager checkout debug | Omit |
| `bc.thainexus.co.th` | `wix.thainexus.co.th` |
| BC Supabase | **Separate** Wix Supabase |

---

## 10. Suggested milestone plan

### Milestone A - Skeleton
Repo, host, Supabase schema, Wix app shell, OAuth install/uninstall, empty Dashboard with style tokens, `/health`

### Milestone B - Config parity
Settings / Fees / Boxes (full Settings UX from §3.1), encryption, test connection, services toggles, product search, Privacy copy

### Milestone C - Checkout rates
SPI adapter + shared pipeline + eligibility/boxing rules + debug logs

### Milestone D - Shipments
Order webhook (always-200, idempotent) + Shipments tab

### Milestone E - Hardening
GDPR/privacy webhooks if required, error handling, staging smoke tests, production secrets, App Market prep

---

## 11. Out of scope (v1)

- Sharing production DB or secrets with BC / Shopify apps
- BC Shipping Manager zones / carrier connection / carrier registration email
- BC product app extension iframe URL pattern / Script Manager checkout debug
- Firebase / Firestore
- Storefront theme widgets
- Multi-warehouse / multi-origin beyond single shipper profile
- Thai Nexus sandbox mode (key reserved only)
- BC zone `service_levels` multiselect (unless later product request)
- Replacing Thai Nexus brand colors with Wix Design System defaults

---

## 12. Open decisions (resolve before / during Milestone A)

| Decision | Options | Recommendation |
|---|---|---|
| App display name | Thai Nexus Logistics vs Thainexus Express | Match Shopify brand if cross-platform; else keep Logistics |
| Order webhook trigger | created vs paid | **Paid** if Wix drafts are common |
| Product flag storage | app DB only vs Wix extended fields | **App DB** for v1 speed; extended fields later |
| Hosting | Cloudflare Workers vs Node/Next | Workers to mirror BC ops |
| Admin chrome | Pure `tnxl-*` vs Wix Design System shell | `tnxl-*` inside; Wix chrome only if required |

---

## 13. References

- BigCommerce app spec: [requirements.md](./requirements.md)
- BC UI / port plan: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- Shopify port (same product split): [shopify-requirements.md](./shopify-requirements.md)
- Supabase: [SUPABASE.md](./SUPABASE.md)
- Cloudflare: [CLOUDFLARE.md](./CLOUDFLARE.md)
- Style sources: `admin/tailwind.config.js`, `admin/src/index.css`, `admin/src/App.tsx`, `admin/src/pages/SettingsPage.tsx`
- Rate rules sources: `shared/src/rateEligibility.ts`, `shared/src/packing.ts`, `shared/src/thaiNexus/rates.ts`
- Wix Shipping Rates SPI: https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction
- Wix self-hosted shipping rates tutorial: https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app
- Wix service plugins: https://dev.wix.com/docs/build-apps/develop-your-app/frameworks/self-hosting/supported-extensions/backend-extensions/add-self-hosted-service-plugin-extensions-with-the-sdk
- Wix authentication: https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/about-authentication
- Thai Nexus functions: https://app.thainexus.co.th/functions/

---

*Reviewed and expanded from the Thai Nexus BigCommerce codebase for the Wix port (`wix.thainexus.co.th`, separate git repo + separate Supabase project).*
