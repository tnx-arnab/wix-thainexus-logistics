#!/usr/bin/env node
/**
 * Upload .dev.vars to Cloudflare Worker secrets (supports multiline PEM values).
 * Skips CLOUDFLARE_* and SUPABASE_* keys and comments.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const devVarsPath = path.join(root, '.dev.vars');
const outPath = path.join(root, '.dev.vars.worker');

if (!fs.existsSync(devVarsPath)) {
    console.error('Missing .dev.vars');
    process.exit(1);
}

const vars = {};
let currentKey = null;
let currentLines = [];

function flush() {
    if (!currentKey) return;
    let value = currentLines.join('\n').trim();
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }
    vars[currentKey] = value;
    currentKey = null;
    currentLines = [];
}

for (const line of fs.readFileSync(devVarsPath, 'utf8').split('\n')) {
    if (line.startsWith('#') || !line.trim()) {
        flush();
        continue;
    }
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) {
        flush();
        currentKey = match[1];
        if (match[1].startsWith('CLOUDFLARE_') || match[1].startsWith('SUPABASE_')) {
            currentKey = null;
            continue;
        }
        currentLines = [match[2]];
    } else if (currentKey) {
        currentLines.push(line);
    }
}
flush();

const bulkLines = Object.entries(vars).map(
    ([key, value]) => `${key}=${value.replace(/\r?\n/g, '\\n')}`
);
fs.writeFileSync(outPath, `${bulkLines.join('\n')}\n`, 'utf8');

try {
    execSync(`wrangler secret bulk ${path.basename(outPath)}`, {
        cwd: root,
        stdio: 'inherit',
    });
} finally {
    fs.unlinkSync(outPath);
}
