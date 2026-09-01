import { ThaiNexusQuote, ThaiNexusShippingService } from '../types/thaiNexus.js';
import { normalizeHsCode } from '../hsCode.js';

function functionsBaseUrl(): string {
    const base =
        process.env.THAI_NEXUS_FUNCTIONS_URL || 'https://app.thainexus.co.th/functions/';
    return base.endsWith('/') ? base : `${base}/`;
}

export type QuoteParams = {
    apiToken: string;
    country: string;
    state: string;
    postcode: string;
    city: string;
    actual_weight_kg: number;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    is_document: boolean;
    /** Default true. Checkout SPI sets false for faster apiQuote (still real-time rates). */
    refresh?: boolean;
};

/** BigCommerce times out carrier rate calls quickly; never let an upstream hang block the response. */
const UPSTREAM_TIMEOUT_MS = Number(process.env.THAI_NEXUS_TIMEOUT_MS) || 7000;
const SHIPMENT_CRUD_TIMEOUT_MS =
    Number(process.env.THAI_NEXUS_SHIPMENT_TIMEOUT_MS) || Math.max(UPSTREAM_TIMEOUT_MS, 15000);

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
    timeoutLabel = 'Thai Nexus request'
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`);
        }
        throw err instanceof Error ? err : new Error('Thai Nexus request failed');
    } finally {
        clearTimeout(timer);
    }
}

export async function apiQuote(params: QuoteParams): Promise<{ quotes?: ThaiNexusQuote[] }> {
    const res = await fetchWithTimeout(
        `${functionsBaseUrl()}apiQuote`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                api_token: params.apiToken,
                country: params.country,
                state: params.state,
                postcode: params.postcode,
                city: params.city,
                actual_weight_kg: params.actual_weight_kg,
                length_cm: params.length_cm,
                width_cm: params.width_cm,
                height_cm: params.height_cm,
                is_document: params.is_document,
                refresh: params.refresh !== false,
                requested_at: new Date().toISOString(),
            }),
        },
        UPSTREAM_TIMEOUT_MS,
        'Thai Nexus quote'
    );

    const text = await res.text();
    let body: { message?: string; error?: string; quotes?: ThaiNexusQuote[] } = {};
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            throw new Error('Invalid JSON response from Thai Nexus');
        }
    }
    if (!res.ok) {
        throw new Error(body.message || body.error || `Thai Nexus error ${res.status}`);
    }

    return body;
}

export async function shipmentCrud(
    apiToken: string,
    action: 'list' | 'get' | 'create',
    data: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
    const res = await fetchWithTimeout(
        `${functionsBaseUrl()}shipmentCrud`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                api_token: apiToken,
                action,
                ...data,
            }),
        },
        SHIPMENT_CRUD_TIMEOUT_MS,
        `Thai Nexus shipment ${action}`
    );

    const text = await res.text();
    let body: Record<string, unknown> = {};
    if (text) {
        try {
            body = JSON.parse(text) as Record<string, unknown>;
        } catch {
            throw new Error('Invalid JSON response from Thai Nexus');
        }
    }
    if (!res.ok) {
        throw new Error(
            (body.message as string) || (body.error as string) || `Thai Nexus error ${res.status}`
        );
    }
    if (body.success === false) {
        throw new Error(
            (body.message as string) ||
                (body.error as string) ||
                `Thai Nexus shipment ${action} failed`
        );
    }

    return body;
}

export async function apiSuggestHsCode(
    description: string,
    destinationCountry?: string
): Promise<string> {
    const name = description.trim();
    if (name.length < 2) return '';

    const res = await fetchWithTimeout(
        `${functionsBaseUrl()}suggestHsCode`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                description: name,
                destination_country: destinationCountry || '',
            }),
        },
        Math.min(UPSTREAM_TIMEOUT_MS, 8000),
        'Thai Nexus HS suggest'
    );

    const text = await res.text();
    let body: {
        options?: Array<{ hs_code?: string; confidence?: string }>;
    } = {};
    if (text) {
        try {
            body = JSON.parse(text) as typeof body;
        } catch {
            return '';
        }
    }
    if (!res.ok) return '';

    const options = body.options || [];
    const ranked = options.filter((o) => normalizeHsCode(o.hs_code));
    const preferred =
        ranked.find((o) => String(o.confidence || '').toLowerCase() === 'high') ||
        ranked.find((o) => String(o.confidence || '').toLowerCase() === 'medium') ||
        ranked[0];
    return preferred ? normalizeHsCode(preferred.hs_code) : '';
}

export async function apiShippingServices(apiToken: string): Promise<{
    success: boolean;
    data: ThaiNexusShippingService[];
    cached?: boolean;
    cache_expires_at?: string;
}> {
    const res = await fetchWithTimeout(
        `${functionsBaseUrl()}apiShippingServices`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
        },
        UPSTREAM_TIMEOUT_MS,
        'Thai Nexus shipping services'
    );

    const text = await res.text();
    let body: {
        success?: boolean;
        message?: string;
        error?: string;
        data?: ThaiNexusShippingService[];
        cached?: boolean;
        cache_expires_at?: string;
    } = {};
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            throw new Error('Invalid JSON response from Thai Nexus');
        }
    }
    if (!res.ok) {
        throw new Error(body.message || body.error || `Thai Nexus error ${res.status}`);
    }

    return {
        success: Boolean(body.success),
        data: body.data || [],
        cached: body.cached,
        cache_expires_at: body.cache_expires_at,
    };
}

export async function testConnection(apiToken: string) {
    try {
        await apiQuote({
            apiToken,
            country: 'TH',
            state: 'BKK',
            postcode: '10110',
            city: 'Bangkok',
            actual_weight_kg: 1,
            length_cm: 20,
            width_cm: 15,
            height_cm: 10,
            is_document: false,
        });

        return { valid: true, message: 'Connected to Thai Nexus' };
    } catch (err) {
        return {
            valid: false,
            message: err instanceof Error ? err.message : 'Connection failed',
        };
    }
}
