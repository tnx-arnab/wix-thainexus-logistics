import { MAX_BODY_BYTES } from './httpSecurity.js';

export class PayloadTooLargeError extends Error {
    constructor() {
        super('Payload too large');
        this.name = 'PayloadTooLargeError';
    }
}

/** Re-buffer request body so Express can read it on Cloudflare Workers (stream may be empty). */
export async function bufferRequestBody(request: Request): Promise<Request> {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
        return request;
    }

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) {
        throw new PayloadTooLargeError();
    }

    try {
        const body = await request.text();
        if (body.length > MAX_BODY_BYTES) {
            throw new PayloadTooLargeError();
        }
        return new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: body.length > 0 ? body : undefined,
        });
    } catch (err) {
        if (err instanceof PayloadTooLargeError) throw err;
        return request;
    }
}
