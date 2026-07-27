import type { Request } from 'express';
import { logInstallEvent, resolveInstanceId } from '@thai-nexus/shared';

export function queryMeta(req: Request) {
    const q = req.query;
    const context = typeof q.context === 'string' ? q.context : undefined;
    let instanceId: string | undefined;

    if (context) {
        try {
            instanceId = resolveInstanceId({ context });
        } catch {
            instanceId = undefined;
        }
    }

    return {
        query_keys: Object.keys(q),
        has_code: typeof q.code === 'string' && q.code.length > 0,
        has_context: Boolean(context),
        has_signed_jwt:
            typeof q.signed_payload_jwt === 'string' && q.signed_payload_jwt.length > 0,
        instance_id: instanceId,
    };
}

export async function logRoute(
    route: string,
    req: Request,
    ok: boolean,
    message?: string,
    extra?: { error?: unknown }
) {
    const meta = queryMeta(req);
    let error_name: string | undefined;
    let error_stack: string | undefined;

    if (extra?.error instanceof Error) {
        error_name = extra.error.name;
        error_stack = extra.error.stack?.slice(0, 1500);
    }

    await logInstallEvent({
        route,
        ok,
        message,
        ...meta,
        error_name,
        error_stack,
    });
}
