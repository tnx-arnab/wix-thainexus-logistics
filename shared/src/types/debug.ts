export interface DebugLogProduct {
    id: string;
    title: string;
    qty: number;
    dimensions: string;
    weight: string;
}

export interface DebugLogBox {
    /** Configured box that was used. */
    name: string;
    /** Inner dims of the box (cm) - the parcel size quoted to couriers. */
    length: number;
    width: number;
    height: number;
    /** Total shipment weight: contents + box empty weight (kg). */
    weight: number;
    /** Product labels packed into this box, e.g. "Shoe box ×2". */
    items: string[];
    /** Bounding dims of the packed contents (cm) - diagnostics only. */
    contents?: { length: number; width: number; height: number };
}

export interface DebugApiCall {
    endpoint: string;
    status: number;
    payload: Record<string, unknown>;
    response: unknown;
    cached?: boolean;
}

export interface DebugFinalQuote {
    courier: string;
    days: string | number;
    final_cost: number;
}

export interface DebugLogEntry {
    id: string;
    timestamp: string;
    instanceId: string;
    products: DebugLogProduct[];
    box_count: number;
    boxes: DebugLogBox[];
    destination: {
        city?: string;
        country?: string;
        postcode?: string;
        state?: string;
    };
    api_calls: DebugApiCall[];
    final_quotes: DebugFinalQuote[];
    currency: string;
}
