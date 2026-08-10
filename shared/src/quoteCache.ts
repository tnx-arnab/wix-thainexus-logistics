/** Quote caching disabled — checkout always hits Thai Nexus live. */
export function getCachedQuotes(
    _instanceId: string,
    _payload: Record<string, unknown>
): unknown[] | null {
    return null;
}

export function setCachedQuotes(
    _instanceId: string,
    _payload: Record<string, unknown>,
    _quotes: unknown[]
): void {
    // no-op
}

export function clearQuoteCache(_instanceId?: string): number {
    return 0;
}
