import { AsyncLocalStorage } from 'node:async_hooks';

type WorkerCtx = { waitUntil(promise: Promise<unknown>): void };

const ctxAls = new AsyncLocalStorage<WorkerCtx>();
let fallbackCtx: WorkerCtx | undefined;

export function bindWorkerExecutionContext(ctx: WorkerCtx): void {
    fallbackCtx = ctx;
}

export function clearWorkerExecutionContext(): void {
    fallbackCtx = undefined;
}

export function runWithWorkerContext<T>(ctx: WorkerCtx, fn: () => Promise<T>): Promise<T> {
    fallbackCtx = ctx;
    return ctxAls.run(ctx, fn);
}

function backgroundCtx(): WorkerCtx | undefined {
    return ctxAls.getStore() || fallbackCtx;
}

/** Wix webhooks must respond within ~1250ms; finish heavy work in the background on Workers. */
export function deferWebhookWork(work: Promise<unknown>): void {
    const ctx = backgroundCtx();
    const guarded = work.catch((err) => {
        console.error('[webhook background]', err);
    });
    if (ctx) {
        ctx.waitUntil(guarded);
        return;
    }
    void guarded;
}
