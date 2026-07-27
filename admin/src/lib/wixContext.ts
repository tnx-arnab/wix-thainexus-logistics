/** JWT issued by this app after OAuth (verified shape, not Wix `instance` JWT). */
export function isAppJwt(context: string): boolean {
    if (context.split('.').length !== 3) return false;
    try {
        const part = context.split('.')[1];
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(json) as { user?: { id?: string }; instanceId?: string; context?: string };
        return Boolean(payload.user?.id && (payload.instanceId || payload.context));
    } catch {
        return false;
    }
}

/** UUID-like Wix instance id. */
export function isWixInstanceId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.trim()
    );
}

export function storeContextFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('context') || params.get('instanceId') || params.get('instance');
}

/** Best-effort instance from Wix Dashboard referrer (optional). */
export function instanceFromReferrer(): string | null {
    const ref = document.referrer;
    if (!ref) return null;

    try {
        const url = new URL(ref);
        const fromQuery = url.searchParams.get('instanceId') || url.searchParams.get('instance');
        if (fromQuery && isWixInstanceId(fromQuery)) return fromQuery;
    } catch {
        // ignore
    }

    return null;
}
