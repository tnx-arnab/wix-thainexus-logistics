import type { BcRateItem, BcRateRequest } from '../types/thaiNexus.js';
import { testConnection } from './client.js';

export const CARRIER_CODE = 'thainexus';
export const CARRIER_DISPLAY_NAME = 'Thai Nexus Express';
export const DEFAULT_QUOTE_TTL_SECONDS = 3600;

/** Normalize courier/service identifiers for comparison (e.g. "Swift DAP" → "swift_dap"). */
export function normalizeServiceId(value: string): string {
    return value.trim().replace(/\s+/g, '_').toLowerCase();
}

/**
 * Strip the carrier brand prefix from an API service name so BC checkout shows
 * "Thai Nexus Express (Flex DAP)" instead of "Thai Nexus Express (Thai Nexus Express Flex DAP)".
 */
export function formatServiceDisplayName(serviceName: string): string {
    const trimmed = serviceName.trim();
    if (!trimmed) return trimmed;

    const prefix = CARRIER_DISPLAY_NAME;
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = trimmed.slice(prefix.length).trim();
        if (rest) return rest;
    }

    return trimmed;
}

/** Registered BC carrier zone multiselect values - quote.code must match one of these at checkout. */
export const BC_SERVICE_LEVELS = ['standard', 'express', 'same_day'] as const;
export type BcServiceLevel = (typeof BC_SERVICE_LEVELS)[number];

/** BC v2 stores zone service_levels as a string; rate requests send string[]. */
export function parseZoneServiceLevels(
    raw: string | string[] | undefined | null
): BcServiceLevel[] {
    if (raw == null || raw === '') return [...BC_SERVICE_LEVELS];

    const values = Array.isArray(raw) ? raw : [raw];
    const parsed = values
        .flatMap((v) => String(v).split(','))
        .map((s) => s.trim())
        .filter((s): s is BcServiceLevel =>
            (BC_SERVICE_LEVELS as readonly string[]).includes(s)
        );

    return parsed.length ? parsed : [...BC_SERVICE_LEVELS];
}

export function classifyServiceLevel(
    displayName: string,
    days: string | number | undefined
): BcServiceLevel {
    const name = displayName.toLowerCase();
    let duration = NaN;

    if (typeof days === 'number' && Number.isFinite(days)) {
        duration = days;
    } else if (days != null && days !== '') {
        const match = String(days).match(/(\d+)/);
        if (match) duration = parseInt(match[1], 10);
    }

    if (Number.isFinite(duration)) {
        if (duration <= 1) return 'same_day';
        if (duration <= 3) return 'express';
        return 'standard';
    }

    if (/same[\s-]?day|today|0[\s-]?day|1[\s-]?day/.test(name)) return 'same_day';
    if (/express|priority|overnight|next[\s-]?day/.test(name)) return 'express';
    return 'standard';
}

export function quoteMatchesServiceLevels(
    displayName: string,
    days: string | number | undefined,
    allowedLevels: BcServiceLevel[]
): boolean {
    if (!allowedLevels.length) return true;
    return allowedLevels.includes(classifyServiceLevel(displayName, days));
}

export type BcShippingProviderRateRequest = BcRateRequest & {
    connection_options?: {
        api_token?: string;
        sandbox?: boolean;
    };
    zone_options?: {
        service_levels?: string[];
        delivery_services?: string[];
    };
};

export type BcConnectionCheckRequest = {
    connection_options?: {
        api_token?: string;
        sandbox?: boolean;
    };
};

export type BcConnectionCheckResponse = {
    valid: boolean;
    messages: Array<{ text: string; type: 'INFO' | 'WARNING' | 'ERROR' }>;
};

/** Map BigCommerce Shipping Provider item shape → internal rate items. */
export function normalizeProviderItems(
    items: Array<Record<string, unknown>> | undefined
): BcRateItem[] {
    if (!items?.length) return [];

    return items.map((raw, idx) => {
        const quantity = Math.max(1, Number(raw.quantity) || 1);
        const dims = raw.dimensions as
            | { units?: string; length?: number; width?: number; height?: number }
            | undefined;

        const length =
            raw.length && typeof raw.length === 'object'
                ? (raw.length as { units?: string; value?: number })
                : dims?.length != null
                  ? { units: dims.units || 'cm', value: Number(dims.length) }
                  : undefined;

        const width =
            raw.width && typeof raw.width === 'object'
                ? (raw.width as { units?: string; value?: number })
                : dims?.width != null
                  ? { units: dims.units || 'cm', value: Number(dims.width) }
                  : undefined;

        const height =
            raw.height && typeof raw.height === 'object'
                ? (raw.height as { units?: string; value?: number })
                : dims?.height != null
                  ? { units: dims.units || 'cm', value: Number(dims.height) }
                  : undefined;

        let weight = raw.weight as { units?: string; value?: number } | undefined;
        if (!weight?.value && raw.weight != null && typeof raw.weight !== 'object') {
            weight = { units: 'kilograms', value: Number(raw.weight) };
        }

        const price = raw.price ?? raw.discounted_price;
        let discounted_price: BcRateItem['discounted_price'];
        if (price && typeof price === 'object') {
            discounted_price = price as BcRateItem['discounted_price'];
        } else if (price != null) {
            discounted_price = {
                currency: (raw.currency_code as string) || 'THB',
                amount: String(price),
            };
        }

        const dim = (d?: { units?: string; value?: number }) =>
            d?.value != null
                ? { units: d.units || 'cm', value: Number(d.value) }
                : undefined;

        return {
            product_id:
                raw.product_id != null
                    ? String(raw.product_id)
                    : raw.id != null
                      ? String(raw.id)
                      : undefined,
            name: typeof raw.name === 'string' ? raw.name : undefined,
            quantity,
            length: dim(length),
            width: dim(width),
            height: dim(height),
            weight: dim(weight),
            discounted_price,
        } satisfies BcRateItem;
    });
}

export function resolveProviderApiToken(
    body: BcShippingProviderRateRequest,
    storedToken: string | null
): string | null {
    const fromConnection = body.connection_options?.api_token?.trim();
    if (fromConnection) return fromConnection;
    return storedToken;
}

export type CheckConnectionOptions = {
    /** Token saved in Apps → Thai Nexus when BC zone has no connection fields. */
    storedToken?: string | null;
};

export async function checkConnectionOptions(
    body: BcConnectionCheckRequest,
    options: CheckConnectionOptions = {}
): Promise<BcConnectionCheckResponse> {
    const token =
        body.connection_options?.api_token?.trim() || options.storedToken?.trim() || null;

    if (!token) {
        return {
            valid: true,
            messages: [
                {
                    text: 'Configure your Thai Nexus API token in Apps → Thai Nexus → Settings.',
                    type: 'INFO',
                },
            ],
        };
    }

    const result = await testConnection(token);
    if (result.valid) {
        return { valid: true, messages: [] };
    }

    return {
        valid: false,
        messages: [
            {
                text: result.message || 'Thai Nexus API token is invalid or expired.',
                type: 'ERROR',
            },
        ],
    };
}

export function dispatchDateIso(daysFromNow = 1): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromNow);
    d.setUTCHours(11, 0, 0, 0);
    // BigCommerce wants a full ISO 8601 datetime with a numeric UTC offset and no
    // fractional seconds, matching its docs example (2018-08-29T00:00:00-05:00).
    // It rejects both a bare date (2026-06-10) and a millisecond/"Z" datetime
    // (2026-06-10T11:00:00.000Z) with "dispatch_date must be in the format ISO 8601".
    return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function parseTransitDuration(
    days: string | number | undefined
): { units: 'BUSINESS_DAYS'; duration: number } | undefined {
    if (days == null || days === '') return undefined;

    if (typeof days === 'number' && Number.isFinite(days)) {
        return { units: 'BUSINESS_DAYS', duration: Math.max(1, Math.round(days)) };
    }

    const match = String(days).match(/(\d+)/);
    if (match) {
        return { units: 'BUSINESS_DAYS', duration: Math.max(1, parseInt(match[1], 10)) };
    }

    return undefined;
}
