#!/usr/bin/env node
/**
 * Public production smoke (no secrets).
 */
const healthRes = await fetch('https://wix.thainexus.co.th/health');
const health = await healthRes.json();
if (!healthRes.ok || health.ok !== true || health.d1?.ok !== true) {
    console.error('production /health failed', health);
    process.exit(1);
}

const setupRes = await fetch('https://wix.thainexus.co.th/api/setup');
const setup = await setupRes.json();
if (!setupRes.ok || setup.checks?.d1_ok !== true) {
    console.error('production /api/setup failed', setup);
    process.exit(1);
}
if ('supabase_url' in (setup.checks || {}) || 'supabase_secret_key' in (setup.checks || {})) {
    console.error('production setup still exposes supabase checks', setup.checks);
    process.exit(1);
}

console.log('production smoke ok', {
    health: health.d1,
    ready: setup.ready,
    d1_ok: setup.checks.d1_ok,
});
