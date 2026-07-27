import './loadEnv.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createApp } from './app.js';

for (const key of [
    'JWT_KEY',
    'ENCRYPTION_KEY',
    'WIX_APP_ID',
    'WIX_APP_SECRET',
    'APP_URL',
] as const) {
    if (!process.env[key]?.trim()) {
        console.warn(`[thai-nexus-wix] Missing or empty env: ${key}`);
    }
}

const PORT = Number(process.env.API_PORT) || 3001;
const ADMIN_DEV_URL = process.env.ADMIN_DEV_URL || 'http://localhost:5173';
const isDev = process.env.NODE_ENV !== 'production';

const app = createApp({ serveStatic: !isDev });

if (isDev) {
    app.use(
        '/',
        createProxyMiddleware({
            target: ADMIN_DEV_URL,
            changeOrigin: true,
            ws: true,
        })
    );
}

app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    if (isDev) {
        console.log(`Proxying UI → ${ADMIN_DEV_URL}`);
        console.log(`Cloudflare: npm run cf:dev / npm run cf:deploy`);
    }
});
