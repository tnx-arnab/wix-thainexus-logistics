import {
    extractBearerToken,
    verifyWixJwt,
    webhookVerifySkipped,
    type WixVerifiedClaims,
} from './verify.js';

export type WixWebhookParsed = {
    eventBody: Record<string, unknown>;
    instanceId: string;
    eventType?: string;
    eventId?: string;
};

function unwrapEnvelope(envelope: Record<string, unknown>): WixWebhookParsed | null {
    const instanceId = envelope.instanceId != null ? String(envelope.instanceId) : '';
    const eventType =
        envelope.eventType != null ? String(envelope.eventType) : undefined;

    const inner = envelope.data;
    let eventBody: Record<string, unknown>;
    if (typeof inner === 'string') {
        try {
            eventBody = JSON.parse(inner) as Record<string, unknown>;
        } catch {
            return null;
        }
    } else if (inner && typeof inner === 'object') {
        eventBody = inner as Record<string, unknown>;
    } else if (envelope.slug || envelope.actionEvent) {
        eventBody = envelope;
    } else {
        return null;
    }

    if (!instanceId) return null;

    return {
        eventBody,
        instanceId,
        eventType,
        eventId: eventBody.id != null ? String(eventBody.id) : undefined,
    };
}

function jwtTokenFromInput(raw: unknown, authorization?: string): string | null {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.split('.').length === 3) return trimmed;
    }
    if (Buffer.isBuffer(raw)) {
        const trimmed = raw.toString('utf8').trim();
        if (trimmed.split('.').length === 3) return trimmed;
    }
    const bearer = extractBearerToken(authorization);
    if (bearer && bearer.split('.').length === 3) return bearer;
    return null;
}

function parseVerifiedJwtClaims(claims: WixVerifiedClaims): WixWebhookParsed | null {
    const dataRaw = claims.data;
    if (typeof dataRaw === 'string') {
        try {
            return unwrapEnvelope(JSON.parse(dataRaw) as Record<string, unknown>);
        } catch {
            return null;
        }
    }
    if (dataRaw && typeof dataRaw === 'object') {
        return unwrapEnvelope(dataRaw as Record<string, unknown>);
    }
    return null;
}

/**
 * Wix REST webhooks: POST body is a signed JWT (text), not JSON.
 * @see https://dev.wix.com/docs/api-reference/articles/work-with-wix-apis/platform/about-the-structure-of-webhooks
 */
export function parseWixWebhookRequest(
    raw: unknown,
    authorization?: string
): { ok: true; parsed: WixWebhookParsed } | { ok: false; reason: string } {
    if (
        webhookVerifySkipped() &&
        raw &&
        typeof raw === 'object' &&
        !Buffer.isBuffer(raw)
    ) {
        const body = raw as Record<string, unknown>;
        const instanceId =
            body.instanceId != null
                ? String(body.instanceId)
                : String(
                      (body.metadata as Record<string, unknown> | undefined)?.instanceId ||
                          ''
                  );
        if (instanceId) {
            return {
                ok: true,
                parsed: {
                    eventBody: body,
                    instanceId,
                    eventType: body.eventType ? String(body.eventType) : undefined,
                    eventId: body.id ? String(body.id) : undefined,
                },
            };
        }
    }

    if (webhookVerifySkipped() && typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
            const body = JSON.parse(raw) as Record<string, unknown>;
            const direct = parseWixWebhookRequest(body, authorization);
            if (direct.ok) return direct;
        } catch {
            // fall through to JWT
        }
    }

    const token = jwtTokenFromInput(raw, authorization);
    if (!token) {
        return { ok: false, reason: 'missing-jwt-body' };
    }

    try {
        const claims = verifyWixJwt(token, { assertClaims: false });
        const parsed = parseVerifiedJwtClaims(claims);
        if (!parsed) {
            return { ok: false, reason: 'invalid-jwt-envelope' };
        }
        return { ok: true, parsed };
    } catch (err) {
        return {
            ok: false,
            reason: err instanceof Error ? err.message : 'invalid-jwt',
        };
    }
}
