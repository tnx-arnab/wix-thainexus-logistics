import { extractBearerToken, verifyWixJwt, webhookVerifySkipped } from './verify.js';

export { webhookVerifySkipped };

/**
 * Verify Wix webhook JWT when production verification is enabled.
 * Returns null when auth is missing or invalid (caller should not trust body.instanceId).
 */
export function verifiedWebhookClaims(
    authorization: string | undefined
): Record<string, unknown> | null {
    const auth = extractBearerToken(authorization);
    if (webhookVerifySkipped()) {
        if (!auth) return {};
        try {
            return verifyWixJwt(auth) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    if (!auth) return null;
    try {
        return verifyWixJwt(auth) as Record<string, unknown>;
    } catch {
        return null;
    }
}
