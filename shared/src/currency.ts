const rateCache = new Map<string, { rate: number; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function convertFromThb(amountThb: number, toCurrency: string): Promise<number> {
    const to = toCurrency.toUpperCase();
    if (!Number.isFinite(amountThb) || amountThb <= 0) return 0;
    if (to === 'THB') return Math.round(amountThb * 100) / 100;

    const cacheKey = `THB_${to}`;
    const cached = rateCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return Math.round(amountThb * cached.rate * 100) / 100;
    }

    const res = await fetch(`https://api.frankfurter.app/latest?from=THB&to=${to}`);
    if (!res.ok) {
        throw new Error(`Exchange rate lookup failed (${res.status})`);
    }

    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (!rate) {
        throw new Error(`No exchange rate from THB to ${to}`);
    }

    rateCache.set(cacheKey, { rate, fetchedAt: Date.now() });

    return Math.round(amountThb * rate * 100) / 100;
}
