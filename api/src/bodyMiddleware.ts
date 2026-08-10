import type { NextFunction, Request, Response } from 'express';
import { text } from 'node:stream/consumers';
import { parseWixWebhookRequest } from './wix/parseWebhook.js';

export type WixWebhookRequest = Request & {
    wixWebhook?: {
        instanceId: string;
        eventType?: string;
        eventId?: string;
    };
    wixWebhookParseError?: string;
};

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

/** Wix sends webhook payloads as a JWT string in the POST body (express.text()). */
export function wixWebhookBodyMiddleware() {
    return async (req: WixWebhookRequest, _res: Response, next: NextFunction) => {
        const method = req.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD') {
            return next();
        }

        try {
            const raw = await text(req);
            const result = parseWixWebhookRequest(raw, req.headers.authorization);
            if (result.ok) {
                req.body = result.parsed.eventBody;
                req.wixWebhook = {
                    instanceId: result.parsed.instanceId,
                    eventType: result.parsed.eventType,
                    eventId: result.parsed.eventId,
                };
            } else if (raw.trim().startsWith('{')) {
                req.body = JSON.parse(raw) as Record<string, unknown>;
                req.wixWebhookParseError = result.reason;
            } else {
                req.body = {};
                req.wixWebhookParseError = result.reason;
            }
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
