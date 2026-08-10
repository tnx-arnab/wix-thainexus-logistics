import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listRateTraces } from '@thai-nexus/shared';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.dev.vars') });
config({ path: join(root, '.env') });

async function main() {
    const traces = await listRateTraces(25);
    for (const t of traces) {
        console.log(
            [
                t.logged_at,
                t.phase,
                t.store_id?.slice(0, 8),
                t.destination,
                `items=${t.items}`,
                `quotes=${t.quotes ?? '-'}`,
                t.ok === false ? 'FAIL' : 'ok',
                t.message || '',
                t.path,
            ]
                .filter(Boolean)
                .join(' | ')
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
