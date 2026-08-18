# Thai Nexus Logistics (Wix)

Self-hosted Wix app for Thai Nexus Express checkout rates, merchant settings, and auto shipments.

- **Production host:** `https://wix.thainexus.co.th`
- **Spec:** [docs/wix-requirements.md](docs/wix-requirements.md)
- **Separate** from BigCommerce (`bc.thainexus.co.th`) and Shopify (`shopify.thainexus.co.th`) - own D1 database and secrets.

## Monorepo

```
admin/       Vite + React dashboard (navy/crimson tnxl-* UI)
api/         Express + Cloudflare Worker (OAuth, SPI, webhooks, config)
shared/      Packing, commission, rates, Thai Nexus client, crypto
migrations/  D1 SQLite schema keyed by instance_id
```

## Quick start

1. Create a Wix app - see [docs/WIX-APP-SETUP.md](docs/WIX-APP-SETUP.md)
2. Create D1 `thai-nexus-wix` on point@ - see [docs/D1.md](docs/D1.md)
3. Fill `WIX_*` in `.dev.vars`
4. Install and run:

```bash
npm install
npx wrangler d1 migrations apply thai-nexus-wix --local
npm run dev
```

5. Tunnel the API (`cloudflared tunnel --url http://localhost:8787`) and point Dashboard iframe + SPI `deploymentUri` at the tunnel
6. Deploy: `npm run cf:deploy` (after secrets via `npm run cf:secrets`)

Setup guides: [WIX-APP-SETUP.md](docs/WIX-APP-SETUP.md) · [D1.md](docs/D1.md) · [DEPLOY.md](docs/DEPLOY.md)

## Key endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Liveness + D1 probe |
| `GET /api/session` | Dashboard bootstrap (Easy OAuth mint) |
| `GET/PUT /api/config` | Merchant settings |
| `POST /v1/getRates` (also `/plugins-and-webhooks/…`) | Shipping Rates SPI |
| `POST /api/webhooks/orders` | Auto shipments |
| `POST /api/webhooks/app-lifecycle` | Install / uninstall |
| `POST /api/webhooks/privacy` | GDPR redact |

## App Dashboard checklist

- OAuth: App ID + secret only (Custom authentication off)
- Dashboard Page → admin SPA (`/?instance=…`)
- eCom Shipping Rates SPI → `deploymentUri` = `https://wix.thainexus.co.th/`
- Webhooks: orders (prefer paid), app lifecycle, privacy if required
