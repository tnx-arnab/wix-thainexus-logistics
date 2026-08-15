import type { NextFunction, Request, Response } from 'express';

export const MAX_BODY_BYTES = 1_048_576;
export const BOOTSTRAP_COOKIE = 'tn_bootstrap';

const FRAME_ANCESTORS =
    "frame-ancestors 'self' https://*.wix.com https://*.wixstudio.com https://manage.wix.com https://editor.wix.com";

export function isProduction(): boolean {
    return String(process.env.NODE_ENV || '').trim() === 'production';
}

export function clientErrorMessage(err: unknown, fallback: string): string {
    if (!isProduction() && err instanceof Error && err.message) return err.message;
    return fallback;
}

export function requestIsHttps(req: {
    protocol?: string;
    headers: { [key: string]: unknown };
}): boolean {
    if (req.protocol === 'https') return true;
    const proto = req.headers['x-forwarded-proto'];
    return typeof proto === 'string' && proto.split(',')[0]!.trim() === 'https';
}

export function cookieValue(cookieHeader: string | undefined, name: string): string {
    if (!cookieHeader) return '';
    for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        if (trimmed.slice(0, eq) !== name) continue;
        try {
            return decodeURIComponent(trimmed.slice(eq + 1));
        } catch {
            return trimmed.slice(eq + 1);
        }
    }
    return '';
}

export function bootstrapCookieHeader(value: string, maxAgeSec = 120, secure = true): string {
    const parts = [
        `${BOOTSTRAP_COOKIE}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${maxAgeSec}`,
        'HttpOnly',
    ];
    if (secure) {
        parts.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
        parts.push('SameSite=Lax');
    }
    return parts.join('; ');
}

export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', FRAME_ANCESTORS);
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.removeHeader('X-Powered-By');
    next();
}

export function securityHeadersRecord(): Record<string, string> {
    return {
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': FRAME_ANCESTORS,
        'Cross-Origin-Opener-Policy': 'unsafe-none',
    };
}
