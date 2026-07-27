import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Load root `.env` in local Node only. Workers get env from Wrangler (.dev.vars / secrets). */
const metaUrl = import.meta.url;
if (metaUrl) {
    try {
        const __dirname = dirname(fileURLToPath(metaUrl));
        config({ path: join(__dirname, '../../.env') });
    } catch {
        // Bundled Workers runtime - env is injected by Wrangler
    }
}
