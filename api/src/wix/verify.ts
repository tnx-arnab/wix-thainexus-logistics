import jwt from 'jsonwebtoken';

export function webhookVerifySkipped(): boolean {
    if (String(process.env.NODE_ENV || '').trim() === 'production') return false;
    const v = process.env.WEBHOOK_SKIP_VERIFY?.trim().toLowerCase();
    return v === 'true' || v === '1';
}

export type WixVerifiedClaims = {
    instanceId?: string;
    aud?: string;
    iss?: string;
    data?: unknown;
    [key: string]: unknown;
};

export type SpiJwtDecodeResult = {
    claims: WixVerifiedClaims;
    verifyError?: string;
    unsignedInstanceId?: string;
};

/** PEM from Wix Dev Center or Cloudflare secrets (literal \\n or real newlines). */
export function normalizeWixPublicKeyPem(raw: string | undefined): string {
    if (!raw?.trim()) return '';
    let pem = raw.trim().replace(/\\n/g, '\n');
    if (pem.includes('BEGIN PUBLIC KEY') || pem.includes('BEGIN RSA PUBLIC KEY')) {
        return pem;
    }
    const body = pem.replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [body];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function audienceMatches(aud: unknown, appId: string): boolean {
    if (aud == null) return false;
    if (Array.isArray(aud)) return aud.map(String).includes(appId);
    return String(aud) === appId;
}

function assertWixJwtClaims(claims: WixVerifiedClaims): void {
    if (claims.iss !== 'wix.com') {
        throw new Error(`Invalid JWT iss: ${claims.iss ?? '(missing)'}`);
    }
    const appId = process.env.WIX_APP_ID?.trim();
    if (appId && !audienceMatches(claims.aud, appId)) {
        throw new Error(
            `Invalid JWT aud (expected App ID ${appId}, got ${JSON.stringify(claims.aud)})`
        );
    }
}

/** Instance id from verified (or decoded) Wix JWT claims. */
export function instanceIdFromWixClaims(
    claims: WixVerifiedClaims | Record<string, unknown>
): string | undefined {
    const c = claims as WixVerifiedClaims;
    const data = (c.data || c) as Record<string, unknown>;
    const metadata = (data.metadata || {}) as Record<string, unknown>;
    const id =
        (metadata.instanceId as string) ||
        (c.instanceId as string) ||
        (data.instanceId as string);
    return id ? String(id) : undefined;
}

/**
 * Verify Wix SPI / webhook JWT using the app public key (PEM).
 * Local: WEBHOOK_SKIP_VERIFY=true skips signature checks.
 */
export function verifyWixJwt(
    token: string,
    opts: { assertClaims?: boolean } = {}
): WixVerifiedClaims {
    const { assertClaims = true } = opts;
    if (webhookVerifySkipped()) {
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

    const publicKey = normalizeWixPublicKeyPem(process.env.WIX_PUBLIC_KEY);
    if (!publicKey) {
        throw new Error('WIX_PUBLIC_KEY is not set');
    }

    const claims = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        clockTolerance: 120,
    }) as WixVerifiedClaims;
    // Wix webhook event JWTs are signed but omit iss/aud, unlike SPI request JWTs.
    // The signature is the security boundary; only assert iss/aud where Wix sends them.
    if (assertClaims) assertWixJwtClaims(claims);
    return claims;
}

/** SPI JWT decode with verify error detail for logs (no unsigned trust). */
export function decodeSpiJwtClaims(token: string): SpiJwtDecodeResult {
    try {
        return { claims: verifyWixJwt(token) };
    } catch (err) {
        const verifyError = err instanceof Error ? err.message : String(err);
        let unsignedInstanceId: string | undefined;
        try {
            const decoded = jwt.decode(token) as WixVerifiedClaims | null;
            if (decoded) {
                unsignedInstanceId = instanceIdFromWixClaims(decoded);
            }
        } catch {
            // ignore
        }
        console.warn('[SPI jwt]', verifyError, {
            unsignedInstanceId: unsignedInstanceId || undefined,
        });
        return { claims: {}, verifyError, unsignedInstanceId };
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
    verifyError?: string;
} {
    if (typeof rawBody === 'string') {
        const trimmed = rawBody.trim();
        if (trimmed.split('.').length !== 3) {
            return { request: {}, metadata: {}, verifyError: 'body-not-a-jwt' };
        }
        const { claims, verifyError } = decodeSpiJwtClaims(trimmed);
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
            verifyError,
        };
    }

    if (rawBody && typeof rawBody === 'object') {
        if (!webhookVerifySkipped()) {
            return {
                request: {},
                metadata: {},
                verifyError: 'unsigned-json-spi-body',
            };
        }
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
