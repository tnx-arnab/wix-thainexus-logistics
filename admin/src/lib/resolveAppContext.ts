import { api } from './api';
import { instanceFromReferrer, isAppJwt, isWixInstanceId, storeContextFromUrl } from './wixContext';

/**
 * Resolve Dashboard session into an app JWT for API calls.
 * Sources: ?context= JWT | ?instanceId= | referrer | ?token= (redirect to OAuth)
 */
export async function resolveAppContext(): Promise<string | null> {
    const params = new URLSearchParams(window.location.search);

    const token = params.get('token') || params.get('code');
    if (token) {
        window.location.replace(`/api/auth?${params.toString()}`);
        return null;
    }

    const context = storeContextFromUrl() || instanceFromReferrer();
    if (!context) return null;

    if (isAppJwt(context)) return context;

    if (isWixInstanceId(context) || context.split('.').length === 3 || context.length > 8) {
        const { data } = await api.get<{ context: string }>('/api/session/context', {
            params: { context },
        });
        return data.context;
    }

    return context;
}
