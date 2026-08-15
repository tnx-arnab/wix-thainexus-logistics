#!/usr/bin/env node
/**
 * Boot wrangler locally with isolated D1 and assert /health + /api/setup.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const persist = mkdtempSync(join(tmpdir(), 'tnx-wix-worker-'));
const port = 8798;
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, CI: 'true' };

mkdirSync('admin/dist', { recursive: true });
if (!existsSync('admin/dist/index.html')) {
    writeFileSync('admin/dist/index.html', '<!doctype html><title>ci</title>', 'utf8');
}

function wranglerSync(args) {
    return execFileSync('npx', ['wrangler', ...args], {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

wranglerSync([
    'd1',
    'migrations',
    'apply',
    'thai-nexus-wix',
    '--local',
    '--persist-to',
    persist,
]);

const child = spawn(
    'npx',
    [
        'wrangler',
        'dev',
        '--port',
        String(port),
        '--ip',
        '127.0.0.1',
        '--local',
        '--persist-to',
        persist,
        '--show-interactive-dev-session',
        'false',
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
);

let output = '';
child.stdout.on('data', (chunk) => {
    output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
    output += chunk.toString();
});

function cleanup() {
    try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
        child.kill('SIGTERM');
    }
    rmSync(persist, { recursive: true, force: true });
}

function assert(cond, message) {
    if (!cond) {
        cleanup();
        console.error(message);
        console.error(output.slice(-2000));
        process.exit(1);
    }
}

const ready = await new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
        if (/Ready on|localhost:8798|127\.0\.0\.1:8798|Starting local server/i.test(output)) {
            clearInterval(timer);
            resolve(true);
        } else if (Date.now() - start > 45000) {
            clearInterval(timer);
            resolve(false);
        }
    }, 250);
    child.on('exit', () => {
        clearInterval(timer);
        resolve(false);
    });
});

assert(ready, 'wrangler dev did not become ready');
await new Promise((resolve) => setTimeout(resolve, 500));

async function getJson(path) {
    const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000) });
    const body = await res.json();
    return { status: res.status, body };
}

try {
    const health = await getJson('/health');
    assert(health.status === 200, `health status ${health.status}`);
    assert(health.body.ok === true, `health.ok ${JSON.stringify(health.body)}`);
    assert(health.body.d1?.ok === true, `health.d1 ${JSON.stringify(health.body.d1)}`);
    assert(
        health.body.runtime === 'cloudflare-workers',
        `runtime ${health.body.runtime}`
    );

    const setup = await getJson('/api/setup');
    assert(setup.status === 200, `setup status ${setup.status}`);
    assert(typeof setup.body.ready === 'boolean', `setup ${JSON.stringify(setup.body)}`);
    assert(!('checks' in setup.body), 'setup must not expose secret inventory');

    console.log('worker local ok', { health: health.body, setup: setup.body });
} finally {
    cleanup();
}
