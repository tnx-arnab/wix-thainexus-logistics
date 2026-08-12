import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, decryptStoredSecret, encryptSecret } from './crypto.js';

test('encryptSecret requires ENCRYPTION_KEY and does not use JWT_KEY', () => {
    const prevEnc = process.env.ENCRYPTION_KEY;
    const prevJwt = process.env.JWT_KEY;
    try {
        process.env.JWT_KEY = 'jwt-key-that-is-long-enough';
        delete process.env.ENCRYPTION_KEY;
        assert.throws(() => encryptSecret('token'), /ENCRYPTION_KEY/);
    } finally {
        if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = prevEnc;
        if (prevJwt === undefined) delete process.env.JWT_KEY;
        else process.env.JWT_KEY = prevJwt;
    }
});

test('encryptSecret / decryptSecret round-trip', () => {
    const prevEnc = process.env.ENCRYPTION_KEY;
    try {
        process.env.ENCRYPTION_KEY = 'encryption-key-16+';
        const cipher = encryptSecret('wix-access-token');
        assert.notEqual(cipher, 'wix-access-token');
        assert.equal(decryptSecret(cipher), 'wix-access-token');
    } finally {
        if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = prevEnc;
    }
});

test('decryptStoredSecret returns legacy plaintext', () => {
    const prevEnc = process.env.ENCRYPTION_KEY;
    try {
        process.env.ENCRYPTION_KEY = 'encryption-key-16+';
        assert.equal(
            decryptStoredSecret('eyJhbGciOiJIUzI1NiJ9.aaa.bbb'),
            'eyJhbGciOiJIUzI1NiJ9.aaa.bbb'
        );
    } finally {
        if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = prevEnc;
    }
});
