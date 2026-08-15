const CONTEXT_STORAGE_KEY = 'tn_wix_context';
const SENSITIVE_QUERY_KEYS = ['context', 'instanceId', 'instance_id', 'instance', 'token', 'code'];

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

export function getStoredContext(): string | null {
    try {
        return sessionStorage.getItem(CONTEXT_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function setStoredContext(value: string): void {
    try {
        sessionStorage.setItem(CONTEXT_STORAGE_KEY, value);
    } catch {
        // private mode
    }
}

export function stripSensitiveQueryParams(): void {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of SENSITIVE_QUERY_KEYS) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
        }
    }
    if (changed) {
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', next);
    }
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
