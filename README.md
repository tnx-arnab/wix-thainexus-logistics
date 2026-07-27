# Thai Nexus Logistics (Wix)

Self-hosted Wix app for Thai Nexus Express checkout rates, merchant settings, and auto shipments.

- **Production host:** `https://wix.thainexus.co.th`
- **Spec:** [docs/wix-requirements.md](docs/wix-requirements.md)
- **Separate** from BigCommerce (`bc.thainexus.co.th`) and Shopify (`shopify.thainexus.co.th`) - new Supabase project and secrets.

## Monorepo

```
admin/     Vite + React dashboard (navy/crimson tnxl-* UI)
api/       Express + Cloudflare Worker (OAuth, SPI, webhooks, config)
shared/    Packing, commission, rates, Thai Nexus client, crypto
supabase/  Schema keyed by instance_id
```

## Quick start

1. Create a Wix app - see [docs/WIX-APP-SETUP.md](docs/WIX-APP-SETUP.md)
2. Create a **new** Supabase project - see [docs/SUPABASE.md](docs/SUPABASE.md)
3. Fill `WIX_*` and `SUPABASE_*` in `.env` (local secrets already generated) and `.dev.vars`
4. Install and run:

```bash
npm install
npm run dev
```

5. Tunnel the API (ngrok / Cloudflare) and point App URL + SPI `deploymentUri` at the tunnel
6. Deploy: `npm run cf:deploy` (after secrets via `npm run cf:secrets`)

Setup guides: [WIX-APP-SETUP.md](docs/WIX-APP-SETUP.md) · [SUPABASE.md](docs/SUPABASE.md) · [DEPLOY.md](docs/DEPLOY.md)

## Key endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Liveness + Supabase probe |
| `GET /api/auth` | Wix OAuth install |
| `GET /api/session` | Dashboard bootstrap |
| `GET/PUT /api/config` | Merchant settings |
| `POST /v1/getRates` (also `/plugins-and-webhooks/…`) | Shipping Rates SPI |
| `POST /api/webhooks/orders` | Auto shipments |
| `POST /api/webhooks/app-lifecycle` | Install / uninstall |
| `POST /api/webhooks/privacy` | GDPR redact |

## App Dashboard checklist

- App URL / Redirect → `/api/auth`
- Dashboard Page → admin SPA (`/?context=…`)
- eCom Shipping Rates SPI → `deploymentUri` = `https://wix.thainexus.co.th/`
- Webhooks: orders (prefer paid), app lifecycle, privacy if required
