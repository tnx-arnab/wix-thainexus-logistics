import { api } from './api';
import {
    getStoredContext,
    instanceFromReferrer,
    isAppJwt,
    isWixInstanceId,
    setStoredContext,
    storeContextFromUrl,
    stripSensitiveQueryParams,
} from './wixContext';

/**
 * Resolve Dashboard session into an app JWT for API calls.
 * Sources: sessionStorage | bootstrap cookie | ?instance= (Wix) | referrer
 */
export async function resolveAppContext(): Promise<string | null> {
    const params = new URLSearchParams(window.location.search);

    const token = params.get('token') || params.get('code');
    if (token) {
        window.location.replace(`/api/auth?${params.toString()}`);
        return null;
    }

    const stored = getStoredContext();
    if (stored && isAppJwt(stored)) {
        stripSensitiveQueryParams();
        return stored;
    }

    const context = storeContextFromUrl() || instanceFromReferrer();
    if (!context) {
        try {
            const { data } = await api.get<{ context?: string; instanceId?: string }>('/api/session');
            if (data.context && isAppJwt(data.context)) {
                setStoredContext(data.context);
                stripSensitiveQueryParams();
                return data.context;
            }
            if (data.instanceId) {
                stripSensitiveQueryParams();
                return stored;
            }
        } catch {
            // no cookie session yet
        }
        return stored;
    }

    if (isAppJwt(context)) {
        setStoredContext(context);
        stripSensitiveQueryParams();
        return context;
    }

    if (isWixInstanceId(context) || context.split('.').length === 3 || context.length > 8) {
        try {
            const { data } = await api.get<{ context: string }>('/api/session/context', {
                headers: { 'X-Wix-Context': context },
            });
            if (data.context) setStoredContext(data.context);
            stripSensitiveQueryParams();
            return data.context;
        } catch {
            stripSensitiveQueryParams();
            return null;
        }
    }

    stripSensitiveQueryParams();
    return context;
}
