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

export interface CheckoutPricingContext {
    items: BcRateItem[];
    cartSubtotal: number;
    destinationCountry?: string;
    cartWeightKg?: number;
    itemQuantity?: number;
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

/** @deprecated Legacy single rule - migrated to commissionRules */
export interface MarkupRule {
    type: 'flat' | 'percent';
    value: number;
    apply: 'global' | 'subtotal_under';
    subtotalThresholdThb?: number;
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

export interface StoreConfig {
    apiTokenEncrypted?: string;
    shipper: ShipperProfile;
    commissionRules: CommissionRule[];
    boxes: ShippingBox[];
    /** Unchecked services - empty/undefined means all services enabled. */
    disabledServiceIds?: string[];
    serviceCoverage?: Record<string, ServiceCoverage>;
    productWeightUnit?: ProductWeightUnit;
    chargeActualWeightOnly?: boolean;
    shippingIneligibleProductIds?: Array<string | number>;
    pricingMode?: PricingMode;
    enableCheckoutRates?: boolean;
    enableAutoShipments?: boolean;
    updatedAt?: string;
    /** Legacy */
    markup?: MarkupRule;
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
    shippingIneligibleProductIds?: Array<string | number>;
    pricingMode?: PricingMode;
    enableCheckoutRates?: boolean;
    enableAutoShipments?: boolean;
    currencySymbol?: string;
    updatedAt?: string;
    debugEnabled?: boolean;
    instanceId?: string;
}

export interface ProductSearchResult {
    id: string;
    name: string;
    sku?: string;
}

export interface BcDimension {
    units: string;
    value: number;
}

export interface BcRateItem {
    product_id?: string;
    /** Extra Wix catalog / variant ids for flags and physical override lookup. */
    catalog_lookup_ids?: string[];
    name?: string;
    quantity: number;
    length?: BcDimension;
    width?: BcDimension;
    height?: BcDimension;
    weight?: BcDimension;
    discounted_price?: { currency: string; amount: string };
    hs_code?: string;
    country_of_origin?: string;
}

export interface BcAddress {
    street_1?: string;
    zip?: string;
    city?: string;
    state_iso2?: string;
    country_iso2?: string;
}

/** Neutral rate request DTO (BC-shaped; store_id holds Wix instanceId). */
export interface BcRateRequest {
    base_options: {
        store_id: string;
        currency_code?: string;
        origin?: BcAddress;
        destination: BcAddress;
        items: BcRateItem[];
    };
    connection_options?: {
        api_token?: string;
        sandbox?: boolean;
    };
    zone_options?: {
        service_levels?: string[];
    };
}

export interface BcMoneyAmount {
    currency: string;
    amount: number;
}

export interface BcCarrierQuote {
    code: string;
    rate_id: string;
    display_name: string;
    description?: string;
    cost: BcMoneyAmount;
    discounted_cost?: BcMoneyAmount;
    dispatch_date?: string;
    transit_time?: {
        units: 'DAYS' | 'HOURS' | 'BUSINESS_DAYS';
        duration: number;
    };
    messages?: Array<{ text: string; type: string }>;
}

export interface BcRateResponse {
    quote_id: string;
    messages: Array<{ text: string; type: string }>;
    carrier_quotes: Array<{
        carrier_info: { code: string; display_name: string };
        quotes: BcCarrierQuote[];
    }>;
    ttl?: number;
}

export type BcRateMessageType = 'INFO' | 'WARNING' | 'ERROR';

/** Preferred aliases for platform-agnostic rate pipeline. */
export type RateRequest = BcRateRequest;
export type RateResponse = BcRateResponse;
export type RateItem = BcRateItem;

export interface ThaiNexusQuote {
    courier_name: string;
    display_name: string;
    estimated_days?: string | number;
    final_price_thb: number;
}
