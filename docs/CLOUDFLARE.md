# Cloudflare deploy (Wix)

Account: **point@thainexus.co.th** (`account_id` in `wrangler.jsonc`).

Production host: **`https://wix.thainexus.co.th`** (mirror of BC **`bc.thainexus.co.th`**).

## API token (do not paste in chat)

1. [Cloudflare → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. Template: **Edit Cloudflare Workers**, then add **Account** → **D1** → **Edit**
3. **Account resources** → Include → **point@thainexus.co.th** only
4. **Zone resources** → Include → **thainexus.co.th** → **Edit** (DNS + custom domains)
5. Create and copy the token once

Add to **`.dev.vars`** (gitignored), not to Worker secrets:

```env
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ACCOUNT_ID=60982be87817726f0bbc988e9122e2b7
```

`npm run cf:secrets` **skips** `CLOUDFLARE_*`, `SUPABASE_*`, `WEBHOOK_SKIP_VERIFY`, and `ALLOW_PLAIN_INSTANCE_ID`.

Verify:

```bash
npx wrangler whoami
# should show API Token + account point@thainexus.co.th
```

Then tell your agent **"token is in .dev.vars"** (do not send the token in chat).

## Deploy

```bash
npm run cf:secrets   # after editing .dev.vars
npm run cf:deploy
```

## "Test App" shows ERR_NAME_NOT_RESOLVED

That means your **browser cannot resolve the hostname** in Wix **App URL** (usually `wix.thainexus.co.th`). The Worker can be deployed while DNS is still missing or cached as "does not exist".

### 1. Confirm DNS (Terminal)

```bash
dig +short wix.thainexus.co.th A @1.1.1.1
curl -sI https://wix.thainexus.co.th/health
```

You should see Cloudflare IPs (e.g. `104.21.x.x`) and HTTP `200`. If `dig` is empty, fix Cloudflare (step 2). If `dig` works but the browser fails, fix cache (step 3).

### 2. Attach custom domain in Cloudflare

1. Dashboard → account **point@thainexus.co.th** → **Workers & Pages** → **thai-nexus-wix**
2. **Settings** → **Domains & Routes** → **Add** → **Custom domain** → `wix.thainexus.co.th`
3. **DNS** → zone **thainexus.co.th** → record **`wix`** (proxied), same pattern as **`bc`**

Redeploy if needed:

```bash
npm run cf:deploy
```

### 3. Clear stale DNS in Chrome (common after first setup)

Chrome caches "host not found" aggressively.

1. Open `chrome://net-internals/#dns` → **Clear host cache**
2. Or use a **new Incognito** window
3. macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
4. Optional: set system DNS to **1.1.1.1** temporarily

### 4. Wix Dev Center URLs (new app)

Under **Develop → OAuth** (app `253fa9c1-…` or your current App ID):

| Field | Exact value |
|-------|-------------|
| App URL | `https://wix.thainexus.co.th/api/auth` |
| Redirect URL | `https://wix.thainexus.co.th/api/auth` |

Extensions: Dashboard + SPI → `https://wix.thainexus.co.th/`

No `http://`, no trycloudflare URL, no trailing typo (`.com` vs `.co.th`).

### 5. Temporary fallback: `*.workers.dev`

After deploy, Wrangler prints a **workers.dev** URL, for example:

`https://thai-nexus-wix.point-609.workers.dev`

Open `/health` in your browser. If that works but `wix.thainexus.co.th` does not, the Worker is fine and only the **custom domain / local DNS** needs fixing (steps 2–3 above).

## Verify production

```bash
curl -s https://wix.thainexus.co.th/health
curl -s https://wix.thainexus.co.th/api/setup
```

`checks.wix_app_id` and `checks.ready` should be true. The response is booleans only.
