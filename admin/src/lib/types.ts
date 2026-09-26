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
export type CommissionConditionKind =
    | 'subtotal_range'
    | 'specific_products'
    | 'destination_country'
    | 'weight_range'
    | 'item_quantity'
    | 'shipping_service';
export type FeeType = 'fixed' | 'percentage' | 'quote_percentage' | 'mixed';
export type PickupUnit = 'once' | 'per_item' | 'per_kg';
export type PricingMode = 'basic' | 'advanced';
export type ProductWeightUnit = 'kg' | 'g';

export interface CommissionCondition {
    type: CommissionConditionKind;
    minRange?: number;
    maxRange?: number;
    specificProducts?: Array<string | number>;
    countries?: string[];
    excludeCountries?: boolean;
    minKg?: number;
    maxKg?: number;
    minQuantity?: number;
    maxQuantity?: number;
    serviceIds?: string[];
}

export interface ServiceCoverage {
    worldwide: boolean;
    countries: string[];
    restOfWorld?: boolean;
    excludeCountries?: boolean;
}

export interface CommissionRule {
    id: string;
    conditionType: CommissionConditionType;
    minRange?: number;
    maxRange?: number;
    specificProducts?: Array<string | number>;
    conditions?: CommissionCondition[];
    feeType: FeeType;
    feeValue: number;
    markupPercent?: number;
    cartPercent?: number;
    pickupUnit?: PickupUnit;
    stopProcessing?: boolean;
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
    serviceCoverage?: Record<string, ServiceCoverage>;
    productWeightUnit?: ProductWeightUnit;
    chargeActualWeightOnly?: boolean;
    enableCheckoutRates?: boolean;
    enableAutoShipments?: boolean;
    shippingIneligibleProductIds?: Array<string | number>;
    pricingMode?: PricingMode;
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
    hsCode?: string;
    countryOfOrigin?: string;
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
    api_price_thb?: number | null;
    payment_status?: 'unpaid' | 'paid';
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
    tnx_tracking_number?: string;
    tracking_url?: string;
    api_price_thb?: number | null;
    payment_status?: 'unpaid' | 'paid';
}

export interface ShipmentListResponse {
    data?: ShipmentSummary[];
    pagination?: { total?: number };
    total?: number;
    warning?: string;
    source?: 'thai_nexus' | 'local' | 'merged';
}
