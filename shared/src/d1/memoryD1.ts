import { DatabaseSync } from 'node:sqlite'; // Node 22+; CI uses setup-node 22
import type { AppD1 } from './client.js';

type Bound = {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
};

export function createMigratedMemoryD1(schemaSql: string): AppD1 {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);

    return {
        prepare(query: string) {
            return {
                bind(...values: unknown[]): Bound {
                    const binds = values.map((value) => (value === undefined ? null : value));
                    return {
                        async first<T = Record<string, unknown>>() {
                            const row = sqlite.prepare(query).get(...binds);
                            return (row as T) ?? null;
                        },
                        async all<T = Record<string, unknown>>() {
                            const rows = sqlite.prepare(query).all(...binds);
                            return { results: rows as T[] };
                        },
                        async run() {
                            const info = sqlite.prepare(query).run(...binds);
                            return { success: true, meta: { changes: Number(info.changes) } };
                        },
                    };
                },
            };
        },
        async batch(statements: Bound[]) {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) {
                    results.push(await statement.run());
                }
                sqlite.exec('COMMIT');
                return results;
            } catch (err) {
                sqlite.exec('ROLLBACK');
                throw err;
            }
        },
    };
}
