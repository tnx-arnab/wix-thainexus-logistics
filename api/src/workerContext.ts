type WorkerCtx = { waitUntil(promise: Promise<unknown>): void };

let activeCtx: WorkerCtx | undefined;

export function bindWorkerExecutionContext(ctx: WorkerCtx): void {
    activeCtx = ctx;
}

export function clearWorkerExecutionContext(): void {
    activeCtx = undefined;
}

/** Wix webhooks must respond within ~1250ms; finish heavy work in the background on Workers. */
export function deferWebhookWork(work: Promise<unknown>): void {
    if (activeCtx) {
        activeCtx.waitUntil(work);
        return;
    }
    void work.catch((err) => {
        console.error('[webhook background]', err);
    });
}
