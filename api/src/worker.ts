import { httpServerHandler } from 'cloudflare:node';
import { bufferRequestBody, PayloadTooLargeError } from './bufferRequestBody.js';
import { createApp } from './app.js';
import { bindWorkerExecutionContext, runWithWorkerContext } from './workerContext.js';
import { bindWorkerDb, type AppD1 } from '@thai-nexus/shared';
import { BOOTSTRAP_COOKIE, securityHeadersRecord } from './httpSecurity.js';

const BLACK_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>404</title>
<style>
html,body{margin:0;height:100%;background:#000;color:#fff}
body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif}
.wrap{text-align:center}
h1{margin:0;font-size:clamp(4.5rem,18vw,8rem);font-weight:700;letter-spacing:.12em;line-height:1}
p{margin:.85rem 0 0;color:#737373;font-size:.8rem;font-weight:500;letter-spacing:.28em;text-transform:uppercase}
</style>
</head>
<body>
<div class="wrap"><h1>404</h1><p>Not found</p></div>
</body>
</html>`;

type AssetBinding = { fetch: (request: Request) => Promise<Response> };

function notFoundHeaders(extra?: Headers): Headers {
    const headers = extra ? new Headers(extra) : new Headers();
    for (const [key, value] of Object.entries(securityHeadersRecord())) {
        headers.set(key, value);
    }
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return headers;
}

/** Public host is not a storefront. Wix Dashboard opens `/` with a signed instance JWT. */
async function black404(request: Request, env: { ASSETS: AssetBinding }): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/404.html') {
        try {
            const assetResponse = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
            if (assetResponse.ok && assetResponse.body) {
                return new Response(assetResponse.body, {
                    status: 404,
                    headers: notFoundHeaders(assetResponse.headers),
                });
            }
        } catch {
            // fall through to inlined page
        }
    }
    return new Response(BLACK_404_HTML, { status: 404, headers: notFoundHeaders() });
}

function isDashboardHtmlRequest(url: URL, request: Request): boolean {
    for (const key of ['instance', 'instanceId', 'instance_id', 'context', 'token', 'code']) {
        if (url.searchParams.get(key)?.trim()) return true;
    }
    const cookie = request.headers.get('cookie') || '';
    if (cookie.split(';').some((part) => part.trim().startsWith(`${BOOTSTRAP_COOKIE}=`))) {
        return true;
    }
    if ((request.headers.get('sec-fetch-dest') || '').toLowerCase() === 'iframe') return true;
    const referer = request.headers.get('referer') || '';
    try {
        const host = new URL(referer).hostname.toLowerCase();
        if (host === 'wix.com' || host.endsWith('.wix.com')) return true;
        if (host === 'wixstudio.com' || host.endsWith('.wixstudio.com')) return true;
    } catch {
        // ignore invalid referer
    }
    return false;
}

function payloadTooLargeResponse(): Response {
    return new Response(JSON.stringify({ message: 'Payload too large' }), {
        status: 413,
        headers: {
            'Content-Type': 'application/json',
            ...securityHeadersRecord(),
        },
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
            try {
                const apiRequest = await bufferRequestBody(request);
                bindWorkerDb(env.DB);
                return runWithWorkerContext(ctx, async () => {
                    bindWorkerExecutionContext(ctx);
                    const apiResponse = await apiHandler.fetch(apiRequest, env, ctx);
                    const headers = new Headers(apiResponse.headers);
                    for (const [key, value] of Object.entries(securityHeadersRecord())) {
                        if (!headers.has(key)) headers.set(key, value);
                    }
                    return new Response(apiResponse.body, {
                        status: apiResponse.status,
                        headers,
                    });
                });
            } catch (err) {
                if (err instanceof PayloadTooLargeError) return payloadTooLargeResponse();
                throw err;
            }
        }

        const token = url.searchParams.get('token') || url.searchParams.get('code');
        if (token && (pathname === '/' || pathname === '')) {
            return Response.redirect(
                `${url.origin}/api/oauth/v1/signup?${url.searchParams.toString()}`,
                302
            );
        }

        const isRoot = pathname === '/' || pathname === '';
        if (isAppStaticAsset(pathname) || (isRoot && isDashboardHtmlRequest(url, request))) {
            const assetResponse = await env.ASSETS.fetch(request);
            const headers = new Headers(assetResponse.headers);
            for (const [key, value] of Object.entries(securityHeadersRecord())) {
                headers.set(key, value);
            }
            headers.delete('X-Frame-Options');
            return new Response(assetResponse.body, {
                status: assetResponse.status,
                headers,
            });
        }

        console.info('[worker] 404', { pathname });
        return black404(request, env);
    },
};
