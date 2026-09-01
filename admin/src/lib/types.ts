export interface ShipperProfile {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    email?: string;
}

export type CommissionConditionType = 'subtotal_range' | 'specific_products';
export type FeeType = 'fixed' | 'percentage';

export interface CommissionRule {
    id: string;
    conditionType: CommissionConditionType;
    minRange?: number;
    maxRange?: number;
    specificProducts?: Array<string | number>;
    feeType: FeeType;
    feeValue: number;
    feeLabel?: string;
}

export interface ShippingBox {
    id: string;
    name: string;
    innerLengthCm: number;
    innerWidthCm: number;
    innerDepthCm: number;
    maxWeightKg: number;
    emptyWeightKg: number;
}

export interface ThaiNexusShippingService {
    id: string;
    service_name: string;
    logo: string | null;
}

export interface StoreConfigPublic {
    hasApiToken: boolean;
    shipper: ShipperProfile;
    commissionRules: CommissionRule[];
    boxes: ShippingBox[];
    disabledServiceIds?: string[];
    shippingIneligibleProductIds?: Array<string | number>;
    currencySymbol?: string;
    updatedAt?: string;
    debugEnabled?: boolean;
    instanceId?: string;
}

export interface DebugLogEntry {
    id: string;
    timestamp: string;
    instanceId: string;
    products: Array<{ id: string; title: string; qty: number; dimensions: string; weight: string }>;
    box_count: number;
    boxes: Array<{
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
    }>;
    destination: { city?: string; country?: string; postcode?: string; state?: string };
    api_calls: Array<{
        endpoint: string;
        status: number;
        payload: Record<string, unknown>;
        response: unknown;
        cached?: boolean;
    }>;
    final_quotes: Array<{ courier: string; days: string | number; final_cost: number }>;
    currency: string;
}

export interface ProductSearchResult {
    id: string;
    name: string;
    sku?: string;
}

export interface ProductPhysicalResult {
    productId: string;
    name?: string;
    sku?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    readyForRates: boolean;
    wixEditorHint?: string;
    saved?: boolean;
    savedOverride?: boolean;
    ratesPersisted?: boolean;
    overrideError?: string;
    warning?: string;
    fromOverride?: boolean;
    note?: string;
}

export interface ShipmentSummary {
    request_number: string;
    status?: string;
    volumetric_weight_kg?: number;
    submitted_date?: string;
    created_at?: string;
}

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
    pagination?: { total?: number };
    total?: number;
    warning?: string;
    source?: 'thai_nexus' | 'local' | 'merged';
}
