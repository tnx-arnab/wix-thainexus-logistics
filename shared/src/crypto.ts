import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function requireEncryptionKey(): string {
    const secret = process.env.ENCRYPTION_KEY?.trim() || '';
    if (secret.length < 16) {
        throw new Error('ENCRYPTION_KEY must be at least 16 characters');
    }
    return secret;
}

function keyFromSecret(secret: string): Buffer {
    return scryptSync(secret, 'thai-nexus', 32);
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function encryptSecret(plaintext: string): string {
    const key = keyFromSecret(requireEncryptionKey());
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(ciphertext: string): string {
    const primary = requireEncryptionKey();
    try {
        return decryptWithKey(ciphertext, keyFromSecret(primary));
    } catch (primaryErr) {
        const legacy = process.env.JWT_KEY?.trim() || '';
        if (legacy.length >= 16 && legacy !== primary) {
            try {
                return decryptWithKey(ciphertext, keyFromSecret(legacy));
            } catch {
                // fall through
            }
        }
        throw primaryErr;
    }
}

/** Decrypt at-rest secrets; JWT / opaque legacy plaintext is returned as-is. */
export function decryptStoredSecret(value: string): string {
    if (!value) return value;
    try {
        return decryptSecret(value);
    } catch {
        if (value.includes('.') || value.startsWith('OAU') || value.length < 40) return value;
        return '';
    }
}
