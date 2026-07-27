const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { quotes: unknown; expiresAt: number }>();

function cacheKey(instanceId: string, payload: Record<string, unknown>): string {
    return `${instanceId}:${JSON.stringify(payload)}`;
}

export function getCachedQuotes(
    instanceId: string,
    payload: Record<string, unknown>
): unknown[] | null {
    const key = cacheKey(instanceId, payload);
    const entry = cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
        if (entry) cache.delete(key);

        return null;
    }

    return entry.quotes as unknown[];
}

export function setCachedQuotes(
    instanceId: string,
    payload: Record<string, unknown>,
    quotes: unknown[]
): void {
    cache.set(cacheKey(instanceId, payload), {
        quotes,
        expiresAt: Date.now() + TTL_MS,
    });
}

export function clearQuoteCache(instanceId?: string): number {
    let removed = 0;
    for (const key of [...cache.keys()]) {
        if (!instanceId || key.startsWith(`${instanceId}:`)) {
            cache.delete(key);
            removed++;
        }
    }

    return removed;
}
