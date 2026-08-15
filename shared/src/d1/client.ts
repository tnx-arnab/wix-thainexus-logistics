type D1Statement = {
    bind(...values: unknown[]): D1BoundStatement;
};

type D1BoundStatement = {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
};

export type AppD1 = {
    prepare(query: string): D1Statement;
    batch(statements: D1BoundStatement[]): Promise<unknown[]>;
};

let activeDb: AppD1 | undefined;

export function bindWorkerDb(db: AppD1 | undefined): void {
    activeDb = db;
}

export function clearWorkerDb(): void {
    activeDb = undefined;
}

export function hasDb(): boolean {
    return Boolean(activeDb);
}

export function getDb(): AppD1 {
    if (!activeDb) {
        throw new Error('D1 binding DB is missing. Use wrangler dev / deploy.');
    }
    return activeDb;
}

export function toJson(value: unknown): string {
    return JSON.stringify(value ?? null);
}

export function parseJson<T>(raw: unknown, fallback: T): T;
export function parseJson<T>(raw: unknown): T;
export function parseJson<T>(raw: unknown, fallback?: T): T {
    if (raw == null || raw === '') {
        if (arguments.length > 1) return fallback as T;
        throw new Error('Missing JSON value');
    }
    if (typeof raw === 'object') return raw as T;
    if (typeof raw !== 'string') throw new Error('Invalid JSON value');
    try {
        return JSON.parse(raw) as T;
    } catch {
        if (arguments.length > 1) return fallback as T;
        throw new Error('Invalid JSON in database');
    }
}

export function boolInt(value: boolean): number {
    return value ? 1 : 0;
}

function bound(sql: string, binds: unknown[]): D1BoundStatement {
    return getDb()
        .prepare(sql)
        .bind(...binds.map((value) => (value === undefined ? null : value)));
}

export async function run(sql: string, ...binds: unknown[]) {
    return bound(sql, binds).run();
}

export async function first<T>(sql: string, ...binds: unknown[]): Promise<T | null> {
    return bound(sql, binds).first<T>();
}

export async function all<T>(sql: string, ...binds: unknown[]): Promise<T[]> {
    const res = await bound(sql, binds).all<T>();
    return res.results ?? [];
}

export async function probeDb(): Promise<void> {
    await first('SELECT 1 AS ok FROM stores LIMIT 1');
}
