/** Re-buffer request body so Express can read it on Cloudflare Workers (stream may be empty). */
export async function bufferRequestBody(request: Request): Promise<Request> {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
        return request;
    }

    try {
        const body = await request.text();
        return new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: body.length > 0 ? body : undefined,
        });
    } catch {
        return request;
    }
}
