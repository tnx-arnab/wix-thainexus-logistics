export const CHECKOUT_RATE_MULTIPLIER = 1.25;

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Customer-facing shipping quote from the original Thai Nexus THB price. */
export function applyCheckoutRateMultiplier(originalThb: number): number {
    return roundMoney(originalThb * CHECKOUT_RATE_MULTIPLIER);
}
