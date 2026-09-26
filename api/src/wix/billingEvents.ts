import { getValidAccessToken } from './tokens.js';

export type WixBillingEventType = 'CHARGE' | 'REFUND';

export interface WixBillingEventInput {
    billing_type: WixBillingEventType;
    gross_revenue: string | number;
    net_revenue: string | number;
    wix_share?: string | number;
    created_date?: string;
    description?: string;
    order_id?: string;
    transaction_id?: string;
    external_id?: string;
}

export interface WixBillingEventPayload {
    event: {
        created_date: string;
        billing_type: WixBillingEventType;
        gross_revenue: string;
        net_revenue: string;
        wix_share: string;
        [key: string]: unknown;
    };
}

export interface WixBillingEventResponse {
    ok: boolean;
    status: number;
    data?: Record<string, unknown>;
    error?: string;
}

const WIX_BILLING_EVENT_URL = 'https://www.wixapis.com/apps/v1/billing-event';
export const DEFAULT_WIX_SHARE_RATE = 0.20; // 20% revenue share on profit margin (net revenue)

/**
 * Merchant pays the raw Thai Nexus API price. Gross and net are that charge.
 * The shop's checkout markup stays with the shop and is not app revenue.
 * Wix share stays 20% of net via calculateWixRevenueShare.
 */
export function billingEventForShipmentCharge(input: {
    apiPriceThb: number;
    requestNumber: string;
    orderId?: string;
    paymentIntentId?: string;
}): WixBillingEventInput {
    return {
        billing_type: 'CHARGE',
        gross_revenue: input.apiPriceThb,
        net_revenue: input.apiPriceThb,
        description: `Thai Nexus shipment ${input.requestNumber}`,
        order_id: input.orderId,
        transaction_id: input.paymentIntentId,
        external_id: input.requestNumber,
    };
}

/** Stripe satang for a raw THB API price. Ignores checkout shipping totals. */
export function shipmentChargeSatang(apiPriceThb: number | null | undefined): number | null {
    if (apiPriceThb == null || !Number.isFinite(apiPriceThb) || apiPriceThb <= 0) return null;
    return Math.round(apiPriceThb * 100);
}

/** Format a number or string to 2 decimal places (non-negative magnitude). */
export function formatCurrencyAmount(amount: string | number): string {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (!Number.isFinite(num)) {
        return '0.00';
    }
    return Math.abs(num).toFixed(2);
}

/** Check if value is a valid finite numeric value */
export function isValidNumericAmount(amount: unknown): boolean {
    if (amount === undefined || amount === null || amount === '') return false;
    const num = typeof amount === 'number' ? amount : Number(amount);
    return Number.isFinite(num);
}

/**
 * Calculate Wix revenue share (default 20% on net revenue profit margin).
 */
export function calculateWixRevenueShare(
    netRevenue: string | number,
    shareRate = DEFAULT_WIX_SHARE_RATE
): string {
    const net = typeof netRevenue === 'number' ? netRevenue : parseFloat(String(netRevenue));
    if (!Number.isFinite(net) || net === 0) {
        return '0.00';
    }
    return (Math.abs(net) * shareRate).toFixed(2);
}

/**
 * Format and construct a Wix External Billing Event payload.
 */
export function buildWixBillingEventPayload(input: WixBillingEventInput): WixBillingEventPayload {
    const grossRevenueFormatted = formatCurrencyAmount(input.gross_revenue);
    const netRevenueFormatted = formatCurrencyAmount(input.net_revenue);
    const wixShareFormatted = input.wix_share !== undefined && isValidNumericAmount(input.wix_share)
        ? formatCurrencyAmount(input.wix_share)
        : calculateWixRevenueShare(input.net_revenue);

    const event: WixBillingEventPayload['event'] = {
        created_date: input.created_date || new Date().toISOString(),
        billing_type: input.billing_type,
        gross_revenue: grossRevenueFormatted,
        net_revenue: netRevenueFormatted,
        wix_share: wixShareFormatted,
    };

    if (input.description) event.description = String(input.description);
    if (input.order_id) event.order_id = String(input.order_id);
    if (input.transaction_id) event.transaction_id = String(input.transaction_id);
    if (input.external_id) event.external_id = String(input.external_id);

    return { event };
}

/**
 * Send a Wix External Billing Event using an explicit Wix access token.
 */
export async function sendWixBillingEventWithToken(
    accessToken: string,
    eventInput: WixBillingEventInput
): Promise<WixBillingEventResponse> {
    const payload = buildWixBillingEventPayload(eventInput);

    try {
        const res = await fetch(WIX_BILLING_EVENT_URL, {
            method: 'POST',
            headers: {
                'Authorization': accessToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        let data: Record<string, unknown> | undefined;
        try {
            data = text ? JSON.parse(text) : undefined;
        } catch {
            // response was not JSON
        }

        if (!res.ok) {
            const errorMsg = data && (data.message || data.error_description || data.error)
                ? String(data.message || data.error_description || data.error)
                : `Wix billing event failed with status ${res.status}`;
            return {
                ok: false,
                status: res.status,
                data,
                error: errorMsg,
            };
        }

        return {
            ok: true,
            status: res.status,
            data,
        };
    } catch (err) {
        return {
            ok: false,
            status: 500,
            error: err instanceof Error ? err.message : 'Failed to send billing event to Wix',
        };
    }
}

/**
 * Send a Wix External Billing Event using an instanceId (mints/fetches OAuth access token automatically).
 */
export async function sendWixBillingEvent(
    instanceId: string,
    eventInput: WixBillingEventInput
): Promise<WixBillingEventResponse> {
    const token = await getValidAccessToken(instanceId);
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: `Could not obtain valid Wix access token for instance ${instanceId}`,
        };
    }

    return sendWixBillingEventWithToken(token, eventInput);
}
