import { SessionProps, User } from './types/index.js';

/** Extract Wix instance id from OAuth payload or app context JWT claims. */
export function resolveInstanceId(session: Partial<SessionProps>): string {
    if (session.instance_id?.trim()) {
        return session.instance_id.trim();
    }

    const raw = session.context ?? session.sub;
    if (typeof raw === 'string' && raw.trim()) {
        const value = raw.trim();
        if (value.includes('/')) {
            const part = value.split('/').filter(Boolean).pop();
            if (part) return part;
        }

        return value;
    }

    throw new Error('Could not resolve instance id from Wix session');
}

/** @deprecated use resolveInstanceId */
export function resolveStoreHash(session: Partial<SessionProps>): string {
    return resolveInstanceId(session);
}

function coerceUser(raw: Partial<SessionProps> & Record<string, unknown>): User {
    if (raw.user && typeof raw.user === 'object' && 'id' in raw.user) {
        const u = raw.user as User;
        return { id: u.id, email: u.email || '', username: u.username };
    }

    const owner = raw.owner as User | undefined;
    if (owner?.id !== undefined && owner?.id !== null) {
        return { id: owner.id, email: owner.email || '', username: owner.username };
    }

    return { id: '0', email: 'merchant@wix.com' };
}

/** Map Wix OAuth / instance claims to SessionProps. */
export function normalizeSessionFromWix(
    raw: Partial<SessionProps> & Record<string, unknown>
): SessionProps {
    const user = coerceUser(raw);
    const owner = (raw.owner as User | undefined) ?? user;
    const instanceId = resolveInstanceId({
        ...raw,
        context: (raw.context as string) || (raw.instanceId as string) || (raw.sub as string),
        instance_id:
            (raw.instance_id as string) ||
            (raw.instanceId as string) ||
            undefined,
    });

    return {
        access_token: raw.access_token as string | undefined,
        refresh_token: raw.refresh_token as string | undefined,
        scope: (raw.scope as string | undefined) || '',
        instance_id: instanceId,
        site_id: (raw.site_id as string) || (raw.siteId as string) || undefined,
        meta_site_id:
            (raw.meta_site_id as string) || (raw.metaSiteId as string) || undefined,
        context: instanceId,
        user,
        owner,
        url: raw.url as string | undefined,
    };
}

/** @deprecated alias */
export function normalizeSession(session: Partial<SessionProps>): SessionProps {
    return normalizeSessionFromWix(session as Partial<SessionProps> & Record<string, unknown>);
}
