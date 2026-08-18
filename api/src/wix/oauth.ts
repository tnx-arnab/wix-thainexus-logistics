/**
 * Wix OAuth helpers (self-hosted app).
 * Easy OAuth: https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/authenticate-using-oauth.md
 * Legacy custom auth kept as a fallback until Dev Center Custom Authentication is off.
 */

export type WixTokenResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    instanceId?: string;
    siteId?: string;
    metaSiteId?: string;
};

const INSTANCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asInstanceId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return INSTANCE_UUID_RE.test(trimmed) ? trimmed : undefined;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
    try {
        const data = await res.json();
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

function tokenErrorDetail(data: Record<string, unknown>, status: number): string {
    const detail =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error_description === 'string' && data.error_description) ||
        (typeof data.error === 'string' && data.error) ||
        (data.details ? JSON.stringify(data.details) : '');
    return detail ? `(${status}): ${detail}` : `(${status})`;
}

function parseAccessTokenPayload(data: Record<string, unknown>): WixTokenResponse | null {
    const nested = data.body;
    let src: Record<string, unknown> = data;
    if (typeof nested === 'string') {
        try {
            const parsed = JSON.parse(nested) as unknown;
            if (parsed && typeof parsed === 'object') src = parsed as Record<string, unknown>;
        } catch {
            src = data;
        }
    } else if (nested && typeof nested === 'object') {
        src = nested as Record<string, unknown>;
    }

    const accessToken =
        typeof src.access_token === 'string'
            ? src.access_token
            : typeof data.access_token === 'string'
              ? data.access_token
              : undefined;
    if (!accessToken) return null;

    const expiresIn = Number(src.expires_in ?? data.expires_in);
    const tokenType =
        typeof src.token_type === 'string'
            ? src.token_type
            : typeof data.token_type === 'string'
              ? data.token_type
              : undefined;

    return {
        access_token: accessToken,
        refresh_token:
            typeof src.refresh_token === 'string'
                ? src.refresh_token
                : typeof data.refresh_token === 'string'
                  ? data.refresh_token
                  : undefined,
        expires_in: Number.isFinite(expiresIn) ? expiresIn : undefined,
        token_type: tokenType,
        instanceId: asInstanceId(src.instanceId) || asInstanceId(src.instance_id),
    };
}

/**
 * Easy OAuth: mint a site-scoped access token from app credentials + instanceId.
 * Tokens are valid for 4 hours. No refresh token.
 */
export async function createWixAccessToken(instanceId: string): Promise<WixTokenResponse> {
    const appId = requireEnv('WIX_APP_ID');
    const appSecret = requireEnv('WIX_APP_SECRET');
    const id = asInstanceId(instanceId);
    if (!id) throw new Error('Invalid Wix instanceId');

    const res = await fetch('https://www.wixapis.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: appId,
            client_secret: appSecret,
            instance_id: id,
        }),
    });

    const data = await readJson(res);
    const parsed = parseAccessTokenPayload(data);
    if (!res.ok || !parsed) {
        throw new Error(`Wix Easy OAuth token failed ${tokenErrorDetail(data, res.status)}`);
    }

    return { ...parsed, instanceId: parsed.instanceId || id };
}

/** Exchange install token / authorization code for access + refresh tokens. */
export async function exchangeWixToken(
    code: string,
    redirectUri?: string
): Promise<WixTokenResponse> {
    const appId = requireEnv('WIX_APP_ID');
    const appSecret = requireEnv('WIX_APP_SECRET');

    const body: Record<string, string> = {
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code,
    };
    if (redirectUri?.trim()) {
        body.redirect_uri = redirectUri.trim();
    }

    const res = await fetch('https://www.wixapis.com/oauth/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await readJson(res);
    const parsed = parseAccessTokenPayload(data);
    if (!res.ok || !parsed) {
        throw new Error(`Wix token exchange failed ${tokenErrorDetail(data, res.status)}`);
    }

    return parsed;
}

export async function refreshWixToken(refreshToken: string): Promise<WixTokenResponse> {
    const appId = requireEnv('WIX_APP_ID');
    const appSecret = requireEnv('WIX_APP_SECRET');

    const res = await fetch('https://www.wixapis.com/oauth/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: appId,
            client_secret: appSecret,
            refresh_token: refreshToken,
        }),
    });

    const data = await readJson(res);
    const parsed = parseAccessTokenPayload(data);
    if (!res.ok || !parsed) {
        throw new Error(`Wix refresh failed ${tokenErrorDetail(data, res.status)}`);
    }

    return parsed;
}

/** Token Info: instanceId for opaque OAuth / custom-auth access tokens. */
export async function fetchWixTokenInfo(accessToken: string): Promise<{
    instanceId?: string;
    siteId?: string;
}> {
    try {
        const res = await fetch('https://www.wixapis.com/oauth2/token-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: accessToken }),
        });
        const data = await readJson(res);
        if (!res.ok) return {};
        return {
            instanceId: asInstanceId(data.instanceId) || asInstanceId(data.instance_id),
            siteId: typeof data.siteId === 'string' ? data.siteId : undefined,
        };
    } catch {
        return {};
    }
}

/** Get App Instance using the just-exchanged access token (custom auth). */
export async function fetchWixAppInstance(accessToken: string): Promise<{
    instanceId?: string;
    siteId?: string;
    metaSiteId?: string;
}> {
    try {
        const res = await fetch('https://www.wixapis.com/apps/v1/instance', {
            headers: { Authorization: accessToken },
        });
        const data = await readJson(res);
        if (!res.ok) return {};
        const instance = (data.instance || {}) as Record<string, unknown>;
        const site = (data.site || {}) as Record<string, unknown>;
        return {
            instanceId: asInstanceId(instance.instanceId) || asInstanceId(data.instanceId),
            siteId: typeof site.siteId === 'string' ? site.siteId : undefined,
            metaSiteId: typeof site.metaSiteId === 'string' ? site.metaSiteId : undefined,
        };
    } catch {
        return {};
    }
}

/**
 * Wix custom-auth redirect includes `code` + `instanceId`.
 * Token exchange does not return instanceId; Token Info / JWT / query fill it in.
 */
export async function resolveWixInstallIdentity(
    tokens: WixTokenResponse,
    authCode: string,
    query: { instanceId?: unknown; instance_id?: unknown }
): Promise<{ instanceId: string; siteId?: string; metaSiteId?: string }> {
    const tokenInfo = await fetchWixTokenInfo(tokens.access_token);
    const appInstance = tokenInfo.instanceId
        ? {}
        : await fetchWixAppInstance(tokens.access_token);
    const { instanceIdFromAccessToken } = await import('./tokens.js');

    const instanceId =
        asInstanceId(tokens.instanceId) ||
        tokenInfo.instanceId ||
        appInstance.instanceId ||
        instanceIdFromAccessToken(tokens.access_token) ||
        instanceIdFromAccessToken(authCode) ||
        asInstanceId(query.instanceId) ||
        asInstanceId(query.instance_id);

    if (!instanceId) {
        throw new Error(
            'Could not determine Wix instanceId from token exchange. Check App Dashboard OAuth settings.'
        );
    }

    return {
        instanceId,
        siteId: tokens.siteId || tokenInfo.siteId || appInstance.siteId,
        metaSiteId: tokens.metaSiteId || appInstance.metaSiteId,
    };
}

/** Decode instance id from Wix instance query param (base64 JSON). */
export function parseWixInstanceParam(instance: string): {
    instanceId?: string;
    siteId?: string;
    metaSiteId?: string;
} {
    try {
        const payload = instance.includes('.') ? instance.split('.')[1] : instance;
        const json = Buffer.from(payload, 'base64url').toString('utf8');
        const data = JSON.parse(json) as Record<string, unknown>;
        return {
            instanceId: (data.instanceId as string) || (data.instance_id as string),
            siteId: (data.siteId as string) || (data.site_id as string),
            metaSiteId: (data.metaSiteId as string) || (data.meta_site_id as string),
        };
    } catch {
        return {};
    }
}
