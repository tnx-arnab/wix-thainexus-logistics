/**
 * List recent SPI rate traces from D1.
 * Usage: npx tsx scripts/spi-traces-recent.ts [--local]
 */
import { execSync } from 'node:child_process';

const local = process.argv.includes('--local');
const flag = local ? '--local' : '--remote';
const sql =
    "SELECT logged_at, json_extract(data, '$.phase') AS phase, json_extract(data, '$.store_id') AS store_id, json_extract(data, '$.destination') AS destination, json_extract(data, '$.items') AS items, json_extract(data, '$.quotes') AS quotes, json_extract(data, '$.ok') AS ok, json_extract(data, '$.message') AS message, json_extract(data, '$.path') AS path FROM debug_logs WHERE kind = 'rate_trace' ORDER BY logged_at DESC LIMIT 25";

const raw = execSync(
    `npx wrangler d1 execute thai-nexus-wix ${flag} --command ${JSON.stringify(sql)} --json`,
    { encoding: 'utf8' }
);

type Row = {
    logged_at?: string;
    phase?: string;
    store_id?: string;
    destination?: string;
    items?: number;
    quotes?: number;
    ok?: number;
    message?: string;
    path?: string;
};

const parsed = JSON.parse(raw) as Array<{ results?: Row[] }>;
const rows = parsed.flatMap((block) => block.results || []);

for (const t of rows) {
    console.log(
        [
            t.logged_at,
            t.phase,
            t.store_id?.slice(0, 8),
            t.destination,
            `items=${t.items}`,
            `quotes=${t.quotes ?? '-'}`,
            t.ok === 0 ? 'FAIL' : 'ok',
            t.message || '',
            t.path,
        ]
            .filter(Boolean)
            .join(' | ')
    );
}
