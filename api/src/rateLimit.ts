import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_MAX = 120;
const AUTH_MAX = 30;

function clientIp(req: Request): string {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0]!.trim();
    return req.socket?.remoteAddress || 'unknown';
}

function skipRateLimit(req: Request): boolean {
    const path = req.path || '';
    if (req.method === 'GET' && (path === '/health' || path === '/')) return true;
    if (path.startsWith('/api/webhooks')) return true;
    if (path.startsWith('/v1/')) return true;
    if (path.startsWith('/plugins-and-webhooks')) return true;
    if (path.includes('getRates') || path.includes('getShippingRates')) return true;
    return false;
}

function maxForPath(path: string): number {
    if (path.startsWith('/api/session') || path.startsWith('/api/oauth') || path === '/api/auth') {
        return AUTH_MAX;
    }
    return DEFAULT_MAX;
}

function take(key: string, max: number, now: number): boolean {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
        if (buckets.size > 20_000) {
            for (const [k, b] of buckets) {
                if (b.resetAt <= now) buckets.delete(k);
            }
        }
        return true;
    }
    if (existing.count >= max) return false;
    existing.count += 1;
    return true;
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (skipRateLimit(req)) return next();

    const max = maxForPath(req.path || '');
    const allowed = take(`${clientIp(req)}:${max}`, max, Date.now());
    if (allowed) return next();

    res.setHeader('Retry-After', '60');
    res.status(429).json({ message: 'Too many requests' });
}
