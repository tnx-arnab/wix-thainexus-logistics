# Supabase setup (Wix)

Use a **new** Supabase project. Do not reuse BigCommerce or Shopify databases or keys.

## 1. Create project

1. [supabase.com](https://supabase.com) → New project
2. Note **Project URL** and **service_role** key (Settings → API)
3. Prefer the new `sb_secret_…` secret key when available

## 2. Apply schema

Dashboard → SQL → New query → paste and run [`../supabase/schema.sql`](../supabase/schema.sql).

Tables:

| Table | Tenant key | Purpose |
|---|---|---|
| `stores` | `instance_id` | Wix OAuth access + refresh tokens |
| `store_users` | `instance_id` | Optional user mapping |
| `thai_nexus_config` | `instance_id` | Encrypted API token, shipper, boxes, fees |
| `order_shipments` | `instance_id` | Auto-shipment refs (`order_id` text) |
| `debug_logs` | `instance_id` | Rate traces / install telemetry |
| `install_logs` | `instance_id` | OAuth diagnostics |
| `product_flags` | `(instance_id, product_id)` | document / boxed / eligible / `physical_override` |

**Existing DB:** if `product_flags` has no `physical_override` column, run:

```sql
alter table product_flags add column if not exists physical_override jsonb;
```

RLS is enabled; the API uses the **service role** only.

## 3. Env

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…   # or legacy service_role JWT
```

Copy into `.env` (local) and `.dev.vars` (Cloudflare), then `npm run cf:secrets` for production.

## 4. Verify

```bash
curl -s https://wix.thainexus.co.th/health
# expect: { "ok": true, "supabase": { "ok": true } }
```

After first install, `stores` should have one row per Wix instance.
