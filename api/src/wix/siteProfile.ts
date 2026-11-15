import { listStoresMissingSiteProfile, saveStoreSiteProfile, type StoreRow } from '@thai-nexus/shared';
import { fetchWixAppInstance } from './oauth.js';
import { getValidAccessToken } from './tokens.js';

/** Name or dashboard id still missing. A public URL can arrive later on the hourly pass. */
export function storeNeedsIdentity(row: Pick<StoreRow, 'site_name' | 'site_id' | 'meta_site_id'> | null): boolean {
    if (!row) return false;
    if (!row.site_name) return true;
    if (!row.site_id && !row.meta_site_id) return true;
    return false;
}

/** Persist site name, public URL, owner email, and dashboard ids. Never throws. */
export async function rememberStoreSiteProfile(instanceId: string, accessToken: string): Promise<boolean> {
    try {
        const profile = await fetchWixAppInstance(accessToken);
        if (!profile.siteName && !profile.siteUrl && !profile.siteId && !profile.metaSiteId && !profile.ownerEmail) {
            return false;
        }
        await saveStoreSiteProfile(instanceId, {
            siteId: profile.siteId,
            metaSiteId: profile.metaSiteId,
            siteName: profile.siteName,
            siteUrl: profile.siteUrl,
            ownerEmail: profile.ownerEmail,
        });
        return true;
    } catch (err) {
        console.warn('[wix-site-profile]', instanceId, err instanceof Error ? err.message : err);
        return false;
    }
}

/** Fill installs that never saved a site name or URL. Safe to run on the hourly cron. */
export async function refreshIncompleteStoreProfiles(): Promise<{ checked: number; updated: number }> {
    const ids = await listStoresMissingSiteProfile();
    let updated = 0;
    for (const instanceId of ids) {
        const token = await getValidAccessToken(instanceId);
        if (!token) continue;
        if (await rememberStoreSiteProfile(instanceId, token)) updated += 1;
    }
    return { checked: ids.length, updated };
}
