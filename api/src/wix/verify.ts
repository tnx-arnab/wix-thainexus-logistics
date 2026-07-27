import jwt from 'jsonwebtoken';

export type WixVerifiedClaims = {
    instanceId?: string;
    aud?: string;
    iss?: string;
    data?: unknown;
    [key: string]: unknown;
};

function audienceMatches(aud: unknown, appId: string): boolean {
    if (aud == null) return true;
    if (Array.isArray(aud)) return aud.map(String).includes(appId);
    return String(aud) === appId;
}

function assertWixJwtClaims(claims: WixVerifiedClaims): void {
    if (claims.iss && claims.iss !== 'wix.com') {
        throw new Error(`Invalid JWT iss: ${claims.iss}`);
    }
    const appId = process.env.WIX_APP_ID?.trim();
    if (appId && !audienceMatches(claims.aud, appId)) {
        throw new Error('Invalid JWT aud');
    }
}

/**
 * Verify Wix SPI / webhook JWT using the app public key (PEM).
 * Local: WEBHOOK_SKIP_VERIFY=true skips signature checks.
 */
export function verifyWixJwt(token: string): WixVerifiedClaims {
    if (process.env.WEBHOOK_SKIP_VERIFY === 'true' || process.env.WEBHOOK_SKIP_VERIFY === '1') {
        try {
            const parts = token.split('.');
            if (parts.length >= 2) {
                return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            }
        } catch {
            return {};
        }
        return {};
    }

    const publicKey = process.env.WIX_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (!publicKey) {
        throw new Error('WIX_PUBLIC_KEY is not set');
    }

    const claims = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
    }) as WixVerifiedClaims;
    assertWixJwtClaims(claims);
    return claims;
}

/**
 * SPI JWT for checkout. Wix requires verified JWT (aud/iss/signature).
 * On failure return empty claims so checkout gets HTTP 200 + empty rates (no forged instanceId).
 */
function decodeSpiJwtClaims(token: string): WixVerifiedClaims {
    try {
        return verifyWixJwt(token);
    } catch (err) {
        console.warn('[SPI jwt]', err instanceof Error ? err.message : err);
        return {};
    }
}

export function extractBearerToken(authorization: string | undefined): string | null {
    if (!authorization) return null;
    const m = authorization.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim() || null;
}

/** Parse SPI body - Wix may send JWT text/plain or JSON with nested data. */
export function parseSpiPayload(rawBody: unknown): {
    request: Record<string, unknown>;
    metadata: Record<string, unknown>;
    instanceId?: string;
} {
    if (typeof rawBody === 'string') {
        const claims = decodeSpiJwtClaims(rawBody);
        const data = (claims.data || claims) as Record<string, unknown>;
        const request = (data.request || {}) as Record<string, unknown>;
        const metadata = (data.metadata || {}) as Record<string, unknown>;
        return {
            request,
            metadata,
            instanceId:
                (metadata.instanceId as string) ||
                (claims.instanceId as string) ||
                undefined,
        };
    }

    if (rawBody && typeof rawBody === 'object') {
        const body = rawBody as Record<string, unknown>;
        if (typeof body.data === 'string') {
            return parseSpiPayload(body.data);
        }
        const nested = (body.data || body) as Record<string, unknown>;
        const request = (nested.request || nested) as Record<string, unknown>;
        const metadata = (nested.metadata || {}) as Record<string, unknown>;
        return {
            request,
            metadata,
            instanceId: metadata.instanceId as string | undefined,
        };
    }

    return { request: {}, metadata: {} };
}
