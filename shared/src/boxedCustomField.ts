/** Only `1` is boxed; any other value is treated as not boxed. */
export function parseBoxedCustomFieldValue(value: unknown): boolean {
    if (value === 1) return true;
    if (typeof value === 'string') {
        return value.trim() === '1';
    }

    return false;
}

export function boxedCustomFieldValueToStore(isBoxedProduct: boolean): string {
    return isBoxedProduct ? '1' : '0';
}

export const BOXED_FIELD_VALUE_HINT =
    'Custom field "Boxed Product": enter 1 if this product ships in its retail box (single-item carts use product dimensions). Any other value is treated as 0 (not boxed).';
