import { httpServerHandler } from 'cloudflare:node';
import { bufferRequestBody } from './bufferRequestBody.js';
import { createApp } from './app.js';
import { bindWorkerExecutionContext, runWithWorkerContext } from './workerContext.js';
import { bindWorkerDb, type AppD1 } from '@thai-nexus/shared';

/** Public root is not a storefront - Wix Dashboard opens with ?context=. */
function blank404(): Response {
    return new Response(null, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
    });
}

function isAppStaticAsset(pathname: string): boolean {
    return pathname.startsWith('/assets/');
}

/** Wix Shipping Rates SPI often POSTs to deploymentUri `/` with a Bearer JWT. */
function isShippingSpiPost(request: Request, pathname: string): boolean {
    if (request.method !== 'POST') return false;
    if (
        pathname.startsWith('/v1/') ||
        pathname.startsWith('/plugins-and-webhooks') ||
        pathname.includes('getShippingRates') ||
        pathname.includes('getRates')
    ) {
        return true;
    }
    if (pathname !== '/' && pathname !== '') return false;
    const auth = request.headers.get('authorization') || '';
    if (/^Bearer\s+\S+/i.test(auth)) return true;
    const ct = request.headers.get('content-type') || '';
    return ct.includes('text/plain') || ct.includes('application/jwt');
}

const API_PORT = 8787;

const app = createApp({ serveStatic: false });
app.listen(API_PORT);

const apiHandler = httpServerHandler({ port: API_PORT });

type AssetBinding = { fetch: (request: Request) => Promise<Response> };

let envHydrated = false;
function hydrateProcessEnv(env: Record<string, unknown>): void {
    if (envHydrated) return;
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && !process.env[key]) {
            process.env[key] = value;
        }
    }
    envHydrated = true;
}

export default {
    async fetch(
        request: Request,
        env: { ASSETS: AssetBinding; DB?: AppD1 } & Record<string, unknown>,
        ctx: ExecutionContext
    ): Promise<Response> {
        hydrateProcessEnv(env);
        const url = new URL(request.url);
        const { pathname } = url;

        const isApi =
            pathname.startsWith('/api') ||
            pathname === '/health' ||
            pathname.startsWith('/v1/') ||
            pathname.startsWith('/plugins-and-webhooks') ||
            pathname.includes('getShippingRates') ||
            pathname.includes('getRates') ||
            isShippingSpiPost(request, pathname);

        if (isApi) {
            const apiRequest = await bufferRequestBody(request);
            bindWorkerDb(env.DB);
            return runWithWorkerContext(ctx, async () => {
                bindWorkerExecutionContext(ctx);
                return apiHandler.fetch(apiRequest, env, ctx);
            });
        }

        const token = url.searchParams.get('token') || url.searchParams.get('code');
        if (token && (pathname === '/' || pathname === '')) {
            return Response.redirect(
                `${url.origin}/api/oauth/v1/signup?${url.searchParams.toString()}`,
                302
            );
        }

        if (isAppStaticAsset(pathname) || pathname === '/' || pathname === '') {
            const assetResponse = await env.ASSETS.fetch(request);
            const headers = new Headers(assetResponse.headers);
            headers.set(
                'Content-Security-Policy',
                "frame-ancestors 'self' https://*.wix.com https://*.wixstudio.com https://manage.wix.com https://editor.wix.com"
            );
            headers.delete('X-Frame-Options');
            return new Response(assetResponse.body, {
                status: assetResponse.status,
                headers,
            });
        }

        console.info('[worker] 404', { pathname });
        return blank404();
    },
};
