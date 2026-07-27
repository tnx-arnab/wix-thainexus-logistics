import type { NextFunction, Request, Response } from 'express';

function noop() {
    return (_req: Request, _res: Response, next: NextFunction) => next();
}

export const json = noop;
export const raw = noop;
export const text = noop;
export const urlencoded = noop;

export default { json, raw, text, urlencoded };
