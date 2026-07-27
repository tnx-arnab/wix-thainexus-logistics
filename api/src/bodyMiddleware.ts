import type { NextFunction, Request, Response } from 'express';
import { text } from 'node:stream/consumers';

/** Avoid express body-parser (iconv-lite breaks on Workers). */
export function jsonBodyMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const method = req.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
            return next();
        }

        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
            return next();
        }

        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
            return next();
        }

        try {
            const raw = await text(req);
            req.body = raw ? JSON.parse(raw) : {};
            next();
        } catch (err) {
            next(err);
        }
    };
}

/** Raw body for webhook HMAC verification (Workers-safe). */
export function rawBodyMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (Buffer.isBuffer(req.body)) {
            return next();
        }

        try {
            const raw = await text(req);
            req.body = Buffer.from(raw, 'utf8');
            next();
        } catch (err) {
            next(err);
        }
    };
}
