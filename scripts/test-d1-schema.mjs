#!/usr/bin/env node
/**
 * Apply local D1 migrations and assert schema (tables, generated kind, json_each).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const persist = mkdtempSync(join(tmpdir(), 'tnx-wix-schema-'));
const env = { ...process.env, CI: 'true' };

function wrangler(args) {
    return execFileSync('npx', ['wrangler', ...args], {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function d1(sql) {
    const raw = wrangler([
        'd1',
        'execute',
        'thai-nexus-wix',
        '--local',
        '--persist-to',
        persist,
        '--json',
        '--command',
        sql,
    ]);
    const start = raw.indexOf('[');
    if (start < 0) return [];
    const parsed = JSON.parse(raw.slice(start));
    return parsed[0]?.results ?? [];
}

function assert(cond, message) {
    if (!cond) {
        rmSync(persist, { recursive: true, force: true });
        console.error(message);
        process.exit(1);
    }
}

try {
    wrangler([
        'd1',
        'migrations',
        'apply',
        'thai-nexus-wix',
        '--local',
        '--persist-to',
        persist,
    ]);
    wrangler([
        'd1',
        'migrations',
        'apply',
        'thai-nexus-wix',
        '--local',
        '--persist-to',
        persist,
    ]);

    const tables = d1(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).map((row) => row.name);
    const expected = [
        'debug_logs',
        'install_logs',
        'order_shipments',
        'product_flags',
        'store_users',
        'stores',
        'thai_nexus_config',
    ];
    for (const name of expected) {
        assert(tables.includes(name), `missing table ${name}: ${tables.join(',')}`);
    }

    const flagCols = d1('PRAGMA table_xinfo(product_flags)').map((row) => row.name);
    assert(flagCols.includes('physical_override'), 'product_flags.physical_override missing');

    const debugCols = d1('PRAGMA table_xinfo(debug_logs)').map((row) => row.name);
    assert(debugCols.includes('kind'), 'debug_logs.kind missing');

    d1(
        `INSERT INTO debug_logs (id, instance_id, logged_at, data)
         VALUES ('k1', 'inst-a', '2026-01-01T00:00:00.000Z', '{"kind":"install"}')`
    );
    const kind = d1("SELECT kind FROM debug_logs WHERE id = 'k1'");
    assert(kind[0]?.kind === 'install', `generated kind expected install, got ${JSON.stringify(kind)}`);

    const jsonEach = d1(`SELECT value FROM json_each('["p1","p2"]')`);
    assert(jsonEach.length === 2 && jsonEach[0].value === 'p1', 'json_each failed');

    console.log('d1 schema ok', expected.join(', '));
} finally {
    rmSync(persist, { recursive: true, force: true });
}
