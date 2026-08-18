import { decryptSecret, encryptSecret } from '../crypto.js';
import { isDebugEnabled } from '../d1/debugLog.js';
import { first, parseJson, run, toJson } from '../d1/client.js';
import {
    sanitizeBoxes,
    sanitizeCommissionRules,
    sanitizeDisabledServiceIds,
    sanitizeProductIds,
} from '../validation.js';
import {
    CommissionRule,
    MarkupRule,
    ShipperProfile,
    ShippingBox,
    StoreConfig,
    StoreConfigPublic,
} from '../types/thaiNexus.js';

const DEFAULT_SHIPPER: ShipperProfile = {
    name: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'TH',
};

function migrateBox(raw: Record<string, unknown>, index: number): ShippingBox {
    return {
        id: String(raw.id || `box_${index}`),
        name: String(raw.name || raw.label || `Box ${index + 1}`),
        innerLengthCm: Number(raw.innerLengthCm ?? raw.lengthCm ?? raw.inner_length) || 0,
        innerWidthCm: Number(raw.innerWidthCm ?? raw.widthCm ?? raw.inner_width) || 0,
        innerDepthCm: Number(raw.innerDepthCm ?? raw.heightCm ?? raw.inner_depth) || 0,
        maxWeightKg: Number(raw.maxWeightKg ?? raw.max_weight) || 0,
        emptyWeightKg: Number(
            raw.emptyWeightKg ?? (raw.emptyWeightG ? Number(raw.emptyWeightG) / 1000 : raw.empty_weight)
        ) || 0,
    };
}

function migrateCommissionRules(raw: StoreConfig | null): CommissionRule[] {
    if (raw?.commissionRules?.length) {
        return sanitizeCommissionRules(raw.commissionRules);
    }

    const m = raw?.markup as MarkupRule | undefined;
    if (m && Number(m.value) > 0) {
        return sanitizeCommissionRules([
            {
                id: 'migrated_1',
                conditionType: 'subtotal_range',
                minRange: 0,
                maxRange: m.apply === 'subtotal_under' ? (m.subtotalThresholdThb ?? 0) : 0,
                feeType: m.type === 'percent' ? 'percentage' : 'fixed',
                feeValue: Number(m.value) || 0,
                feeLabel: 'Commission Fee',
            },
        ]);
    }

    return [];
}

function migrateConfig(data: StoreConfig): StoreConfig {
    if (data.shipper && !('street' in data.shipper) && (data.shipper as { address?: string }).address) {
        const s = data.shipper as ShipperProfile & { address?: string };
        data.shipper = {
            ...DEFAULT_SHIPPER,
            ...s,
            street: s.address || s.street || '',
        };
    }

    data.commissionRules = migrateCommissionRules(data);
    data.boxes = (data.boxes || []).map((b, i) =>
        migrateBox(b as unknown as Record<string, unknown>, i)
    );

    return data;
}

export function toPublic(config: StoreConfig | null): StoreConfigPublic {
    if (!config) {
        return {
            hasApiToken: false,
            shipper: DEFAULT_SHIPPER,
            commissionRules: [],
            boxes: [],
            currencySymbol: '฿',
            debugEnabled: isDebugEnabled(),
        };
    }

    const c = migrateConfig({ ...config });

    return {
        hasApiToken: Boolean(c.apiTokenEncrypted),
        shipper: c.shipper || DEFAULT_SHIPPER,
        commissionRules: c.commissionRules || [],
        boxes: c.boxes || [],
        disabledServiceIds: sanitizeDisabledServiceIds(c.disabledServiceIds),
        shippingIneligibleProductIds: sanitizeProductIds(c.shippingIneligibleProductIds),
        currencySymbol: '฿',
        updatedAt: c.updatedAt,
        debugEnabled: isDebugEnabled(),
    };
}

export async function getConfig(instanceId: string) {
    const row = await first<{ data: string }>(
        'SELECT data FROM thai_nexus_config WHERE instance_id = ?',
        instanceId
    );
    if (!row?.data) return null;
    return migrateConfig(parseJson<StoreConfig>(row.data));
}

export async function getConfigPublic(instanceId: string) {
    return { ...toPublic(await getConfig(instanceId)), instanceId };
}

export async function getApiToken(instanceId: string) {
    const config = await getConfig(instanceId);
    if (!config?.apiTokenEncrypted) return null;

    try {
        return decryptSecret(config.apiTokenEncrypted);
    } catch {
        return null;
    }
}

export async function saveConfig(
    instanceId: string,
    input: {
        apiToken?: string;
        shipper: ShipperProfile;
        commissionRules?: CommissionRule[];
        boxes?: ShippingBox[];
        disabledServiceIds?: string[];
        shippingIneligibleProductIds?: Array<string | number>;
    }
) {
    const existing = await getConfig(instanceId);
    const data: StoreConfig = {
        shipper: input.shipper,
        commissionRules: sanitizeCommissionRules(
            input.commissionRules ?? existing?.commissionRules ?? []
        ),
        boxes: sanitizeBoxes(input.boxes ?? existing?.boxes ?? []),
        disabledServiceIds: sanitizeDisabledServiceIds(
            input.disabledServiceIds ?? existing?.disabledServiceIds ?? []
        ),
        shippingIneligibleProductIds: sanitizeProductIds(
            input.shippingIneligibleProductIds ?? existing?.shippingIneligibleProductIds ?? []
        ),
        updatedAt: new Date().toISOString(),
    };

    if (input.apiToken?.trim()) {
        data.apiTokenEncrypted = encryptSecret(input.apiToken.trim());
    } else if (existing?.apiTokenEncrypted) {
        data.apiTokenEncrypted = existing.apiTokenEncrypted;
    }

    const updatedAt = data.updatedAt || new Date().toISOString();
    await run(
        `INSERT INTO thai_nexus_config (instance_id, data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(instance_id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
        instanceId,
        toJson(data),
        updatedAt
    );

    return toPublic(data);
}

export async function copyConfigIfMissing(
    fromInstanceId: string,
    toInstanceId: string
): Promise<boolean> {
    const from = fromInstanceId.trim();
    const to = toInstanceId.trim();
    if (!from || !to || from === to) return false;

    const dest = await first<{ instance_id: string }>(
        'SELECT instance_id FROM thai_nexus_config WHERE instance_id = ?',
        to
    );
    if (dest) return false;

    const source = await first<{ data: string }>(
        'SELECT data FROM thai_nexus_config WHERE instance_id = ?',
        from
    );
    if (!source?.data) return false;

    await run(
        `INSERT INTO thai_nexus_config (instance_id, data, updated_at)
         VALUES (?, ?, ?)`,
        to,
        source.data,
        new Date().toISOString()
    );
    return true;
}

export async function deleteConfig(instanceId: string) {
    await run('DELETE FROM thai_nexus_config WHERE instance_id = ?', instanceId);
}
