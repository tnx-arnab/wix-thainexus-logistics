# Local install test (tunnel)

Use this when `npm run dev` and `cloudflared` are running.

## Current tunnel (session)

Replace after each new `cloudflared tunnel --url http://localhost:3001`:

- Base: `https://institutes-gray-allocation-preferences.trycloudflare.com`
- OAuth: `https://institutes-gray-allocation-preferences.trycloudflare.com/api/auth`
- Dashboard: `https://institutes-gray-allocation-preferences.trycloudflare.com/`
- SPI base (`deploymentUri`): same base URL + `/`
- Webhooks: `https://institutes-gray-allocation-preferences.trycloudflare.com/api/webhooks/orders` (and lifecycle)

## Wix App Dashboard (paste now)

**Develop → OAuth**

- App URL: `https://institutes-gray-allocation-preferences.trycloudflare.com/api/auth`
- Redirect URL: same as App URL
- Save

**Extensions**

- Dashboard Page URL: `https://institutes-gray-allocation-preferences.trycloudflare.com/`
- Shipping Rates `deploymentUri`: `https://institutes-gray-allocation-preferences.trycloudflare.com/`

**Webhooks** (callback URLs)

- **eCommerce → Payment status updated** → `https://institutes-gray-allocation-preferences.trycloudflare.com/api/webhooks/orders` (shipments run only when status is **PAID**)
- App installed / removed → `.../api/webhooks/app-lifecycle`
- Remove deprecated **Stores → Order Paid** if still listed

## Install on a test site

1. Wix Dev Center → **Test App** → open on a development site
2. Complete install; you should land on the admin with Settings
3. Supabase **stores** table → one row (`instance_id`)
4. `GET .../api/setup` → `checks.ready` / `checks.supabase_ok` true

## Merchant setup

1. Settings → Thai Nexus API token + shipper → Save
2. Boxes / Fees as needed
3. Test checkout on the site for Thai Nexus Express rates

## Commands (two terminals)

```bash
npm run dev
cloudflared tunnel --url http://localhost:3001
```

Verify: `curl -s https://YOUR-TUNNEL/health`
