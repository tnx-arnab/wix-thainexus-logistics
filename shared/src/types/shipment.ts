export interface ShipmentAddress {
    name?: string;
    phone?: string;
    address?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
}

export interface ShipmentLineItem {
    description: string;
    quantity: number;
    declared_value: number;
    currency_code?: string;
    hs_code?: string;
    country_of_origin?: string;
}

export interface ShipmentSummary {
    request_number: string;
    status?: string;
    volumetric_weight_kg?: number;
    submitted_date?: string;
    created_at?: string;
    data?: Record<string, unknown>;
}

export interface ShipmentDetail extends ShipmentSummary {
    shipper_address?: ShipmentAddress;
    consignee_address?: ShipmentAddress;
    actual_weight_kg?: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    shipment_description?: string;
}

export interface ShipmentListResponse {
    data?: ShipmentSummary[];
    pagination?: { total?: number; page?: number; limit?: number };
    total?: number;
    warning?: string;
    source?: 'thai_nexus' | 'local' | 'merged';
}

export interface OrderShipmentRecord {
    orderId: string;
    instanceId: string;
    requestNumbers: string[];
    shipments: Array<{
        request_number: string;
        status?: string;
        id?: string | number;
    }>;
    packedBoxes?: Array<{
        length: number;
        width: number;
        height: number;
        weight: number;
        items?: string[];
    }>;
    /** Non-fatal problems captured during creation (partial failures, packing warnings). */
    errors?: string[];
    /** Packed box count for this order - used to resume partial webhook runs. */
    expectedBoxCount?: number;
    /** True when every expected box has a Thai Nexus request number. */
    complete?: boolean;
    createdAt: string;
}
