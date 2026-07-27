export interface User {
    id: string | number;
    email: string;
    username?: string;
}

export interface SessionProps {
    access_token?: string;
    refresh_token?: string;
    /** App JWT or raw instance id */
    context?: string;
    owner?: User;
    scope?: string;
    instance_id?: string;
    site_id?: string;
    meta_site_id?: string;
    sub?: string;
    user: User;
    url?: string;
}

export interface SessionContext {
    accessToken: string;
    instanceId: string;
    user: User;
    siteId?: string;
}

export type QueryParams = Record<string, string | string[] | undefined>;

export * from './thaiNexus.js';
