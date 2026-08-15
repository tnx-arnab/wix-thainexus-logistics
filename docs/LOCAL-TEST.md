# Local install test (tunnel)

Use this when `npm run dev` and `cloudflared` are running.

API is Wrangler on port **8787** (D1 local). Vite on 5173 proxies `/api` there.

## Tunnel

```bash
cloudflared tunnel --url http://localhost:8787
```

Point Wix App URL, Redirect, Dashboard, SPI `deploymentUri`, and webhooks at that tunnel (same paths as production).

## Install on a test site

1. Wix Dev Center → **Test App** → open on a development site
2. Complete install; you should land on the admin with Settings
3. Confirm a `stores` row:

```bash
npx wrangler d1 execute thai-nexus-wix --local --command "SELECT instance_id FROM stores"
```

4. `GET .../api/setup` → `checks.ready` / `checks.d1_ok` true

## Merchant setup

1. Settings → Thai Nexus API token + shipper → Save
2. Boxes / Fees as needed
3. Test checkout on the site for Thai Nexus Express rates

## Commands (two terminals)

```bash
npx wrangler d1 migrations apply thai-nexus-wix --local
npm run dev
cloudflared tunnel --url http://localhost:8787
```

Verify: `curl -s https://YOUR-TUNNEL/health` → `d1.ok: true`
