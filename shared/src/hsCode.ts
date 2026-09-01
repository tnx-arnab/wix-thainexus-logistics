const HS_FIELD = /^(hs_?code|hts_?code|tariff_?code|harmonized.*code|customs_?hs.*)$/i;
const HS_TITLE = /hs\s*code|hts\s*code|harmonized|tariff\s*code/i;
const NESTED_OBJECTS = [
    'physicalProperties',
    'shippingDetails',
    'catalogReference',
    'options',
    'taxInfo',
    'variantsInfo',
];
const NESTED_LISTS = [
    'additionalInfoSections',
    'customTextFields',
    'customFields',
    'infoSections',
    'descriptionLines',
    'variants',
    'productVariants',
];

/** Thai Nexus stores 6-10 digit codes with no separators (e.g. 180690). */
export function normalizeHsCode(raw: unknown): string {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 12) return '';
    return digits.length > 10 ? digits.slice(0, 10) : digits;
}

export function extractHsCodeFromText(text: string): string {
    const stripped = String(text || '').replace(/<[^>]+>/g, ' ');
    const labeled = stripped.match(
        /(?:hs|hts|harmonized(?:\s+system)?)\s*codes?\s*[:#-]?\s*([0-9]{4,6}(?:[.\s]?[0-9]{2,4})?)/i
    );
    if (labeled) return normalizeHsCode(labeled[1]);
    return '';
}

function fieldValue(item: Record<string, unknown>): unknown {
    return (
        item.description ||
        item.plainDescription ||
        item.value ||
        item.content ||
        item.plainText ||
        item.text
    );
}

export function extractHsCodeFromRecord(obj: unknown, depth = 0): string {
    if (!obj || typeof obj !== 'object' || depth > 5) return '';
    const row = obj as Record<string, unknown>;

    for (const [key, value] of Object.entries(row)) {
        if (!HS_FIELD.test(key)) continue;
        const code = normalizeHsCode(value);
        if (code) return code;
    }

    for (const key of NESTED_OBJECTS) {
        const code = extractHsCodeFromRecord(row[key], depth + 1);
        if (code) return code;
    }

    for (const key of NESTED_LISTS) {
        const list = row[key];
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            if (!entry || typeof entry !== 'object') continue;
            const item = entry as Record<string, unknown>;
            const title = String(item.title || item.name || item.key || item.label || '');
            if (HS_TITLE.test(title)) {
                const code =
                    normalizeHsCode(fieldValue(item)) ||
                    extractHsCodeFromText(String(fieldValue(item) ?? ''));
                if (code) return code;
            }
            const nested = extractHsCodeFromRecord(item, depth + 1);
            if (nested) return nested;
        }
    }

    if (typeof row.sku === 'string') {
        const skuDigits = row.sku.replace(/\D/g, '');
        if (skuDigits.length >= 6 && skuDigits.length <= 10 && skuDigits === normalizeHsCode(row.sku)) {
            return skuDigits;
        }
    }

    for (const text of [row.description, row.plainDescription]) {
        if (typeof text !== 'string') continue;
        const code = extractHsCodeFromText(text);
        if (code) return code;
    }

    return '';
}
