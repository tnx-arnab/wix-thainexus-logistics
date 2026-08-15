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
if (!setupRes.ok || setup.ready !== true) {
    console.error('production /api/setup failed', setup);
    process.exit(1);
}
if ('checks' in setup) {
    console.error('production setup still exposes secret inventory', setup);
    process.exit(1);
}

console.log('production smoke ok', {
    health: health.d1,
    ready: setup.ready,
});
