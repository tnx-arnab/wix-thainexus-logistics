import axios from 'axios';
import type {
    ProductSearchResult,
    ProductPhysicalResult,
    DebugLogEntry,
    ShipmentDetail,
    ShipmentListResponse,
    StoreConfigPublic,
    ThaiNexusShippingService,
} from './types';

export const api = axios.create({
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
    },
    params: {
        'ngrok-skip-browser-warning': 'true',
    },
});

api.interceptors.request.use((config) => {
    const context =
        (config.params?.context as string | undefined) ||
        new URLSearchParams(window.location.search).get('context');
    if (context) {
        config.params = { ...config.params, context };
    }

    return config;
});

export type ApiError = Error & {
    code?: string;
    installUrl?: string;
    connectUrl?: string;
    instanceId?: string;
};

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const data = error.response?.data as
            | {
                  message?: string;
                  code?: string;
                  install_url?: string;
                  connect_url?: string;
                  instance_id?: string;
              }
            | undefined;

        const err = new Error(data?.message || error.message || 'Request failed') as ApiError;
        err.code = data?.code;
        err.installUrl = data?.install_url;
        err.connectUrl = data?.connect_url;
        err.instanceId = data?.instance_id;

        return Promise.reject(err);
    }
);

export async function fetchConfig(): Promise<StoreConfigPublic> {
    const { data } = await api.get<StoreConfigPublic>('/api/config');

    return data;
}

export async function saveConfig(body: Record<string, unknown>): Promise<StoreConfigPublic> {
    const { data } = await api.put<StoreConfigPublic>('/api/config', body);

    return data;
}

export async function searchProducts(
    q: string,
    options?: { signal?: AbortSignal }
): Promise<ProductSearchResult[]> {
    const { data } = await api.get<ProductSearchResult[]>('/api/products/search', {
        params: { q },
        signal: options?.signal,
    });

    return data;
}

export async function fetchProductsByIds(ids: Array<string | number>): Promise<ProductSearchResult[]> {
    if (!ids.length) return [];

    const { data } = await api.get<ProductSearchResult[]>('/api/products/by-ids', {
        params: { ids: ids.join(',') },
    });

    return data;
}

export async function fetchProductPhysical(productId: string): Promise<ProductPhysicalResult> {
    const { data } = await api.get<ProductPhysicalResult>(
        `/api/products/${encodeURIComponent(productId)}/physical`
    );
    return data;
}

export async function saveProductPhysical(
    productId: string,
    dims: { lengthCm: number; widthCm: number; heightCm: number; weightLb?: number }
): Promise<ProductPhysicalResult> {
    const { data } = await api.put<ProductPhysicalResult>(
        `/api/products/${encodeURIComponent(productId)}/physical`,
        dims
    );
    return data;
}

export async function fetchWebhookStatus(): Promise<{
    orderWebhookHits: number;
    lastOrderWebhook: { message?: string; ok?: boolean; created_at?: string } | null;
    hint?: string;
}> {
    const { data } = await api.get('/api/orders/webhook-status');
    return data;
}

export async function syncRecentOrders(limit = 10): Promise<{
    scanned: number;
    results: Array<{ orderId: string; number?: string; ok: boolean; reason: string; skipped?: boolean }>;
    hint?: string;
}> {
    const { data } = await api.post('/api/orders/sync-recent', { limit });
    return data;
}

export async function fetchShipments(
    page = 1,
    limit = 10
): Promise<ShipmentListResponse> {
    const { data } = await api.get<ShipmentListResponse>('/api/shipments', {
        params: { page, limit },
    });

    return data;
}

export async function fetchShipmentDetail(requestNumber: string): Promise<ShipmentDetail> {
    const { data } = await api.get<ShipmentDetail>(
        `/api/shipments/${encodeURIComponent(requestNumber)}`
    );

    return data;
}

export async function fetchDebugLogs(): Promise<DebugLogEntry[]> {
    const { data } = await api.get<DebugLogEntry[]>('/api/debug');

    return Array.isArray(data) ? data : [];
}

export async function clearDebugLogs(): Promise<void> {
    await api.delete('/api/debug');
}

export async function clearDebugCache(): Promise<{ cleared: number }> {
    const { data } = await api.delete<{ cleared: number }>('/api/debug/cache');

    return data;
}

export async function fetchProductDocumentFlag(
    productId: string
): Promise<{ isDocument: boolean }> {
    const { data } = await api.get<{ isDocument: boolean }>(
        `/api/products/${productId}/document-flag`
    );

    return data;
}

export interface ProductThaiNexusFlags {
    isDocument: boolean;
    shippingEligible: boolean;
    isBoxedProduct: boolean;
}

export async function fetchProductFlags(productId: string): Promise<ProductThaiNexusFlags> {
    const { data } = await api.get<ProductThaiNexusFlags>(`/api/products/${productId}/flags`);

    return data;
}

export async function saveProductFlags(
    productId: string,
    flags: ProductThaiNexusFlags
): Promise<ProductThaiNexusFlags> {
    const { data } = await api.put<ProductThaiNexusFlags>(
        `/api/products/${productId}/flags`,
        flags
    );

    return data;
}

export async function saveProductDocumentFlag(
    productId: string,
    isDocument: boolean
): Promise<{ isDocument: boolean }> {
    const { data } = await api.put<{ isDocument: boolean }>(
        `/api/products/${productId}/document-flag`,
        { isDocument }
    );

    return data;
}

export async function fetchShippingServices(): Promise<ThaiNexusShippingService[]> {
    const { data } = await api.get<{ services: ThaiNexusShippingService[] }>(
        '/api/shipping/services'
    );

    return data.services || [];
}

export async function testConnection(apiToken?: string): Promise<{ valid: boolean; message?: string }> {
    const { data } = await api.post<{ valid: boolean; message?: string }>(
        '/api/shipping/check-connection',
        { apiToken: apiToken || undefined }
    );

    return data;
}

export type MerchantSpiEventRow = {
    logged_at: string;
    phase: string;
    path?: string;
    destination?: string;
    items?: number;
    quotes?: number;
    ms?: number;
    ok?: boolean;
    message?: string;
};

export async function fetchSpiTraces(): Promise<{
    instanceId: string;
    hint?: string;
    merchantEvents: MerchantSpiEventRow[];
    globalTraces: MerchantSpiEventRow[];
}> {
    const { data } = await api.get('/api/debug/spi-traces');
    return data;
}
