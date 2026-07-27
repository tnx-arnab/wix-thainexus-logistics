/** Keep in sync with `shared/src/boxedCustomField.ts`. */
export const BOXED_PRODUCT_FIELD_NAME = 'Boxed Product';

export const BOXED_PRODUCT_FIELD_GUIDE = {
    title: 'How it works',
    intro:
        'Product boxing is managed in Thai Nexus (Settings / product flags). You only change the value per product - you do not invent a field name.',
    steps: [
        'Open a product in the Wix product editor (or set flags via Thai Nexus when a product panel is available).',
        `Set ${BOXED_PRODUCT_FIELD_NAME} / Is boxed? to 1 if the item ships in its retail box.`,
        'Leave it at 0 for normal packing (default). Any value other than 1 counts as 0.',
    ],
    note: "When set to 1, Thai Nexus quotes using that product's weight and dimensions, but only if it is the only product in the cart. Mixed carts use your packing boxes.",
} as const;
