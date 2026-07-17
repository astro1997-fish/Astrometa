"use strict";
/**
 * AES-256-GCM encryption for sensitive settings stored in system_settings.
 *
 * Encrypted values are prefixed with "enc:" so legacy plain-text rows can be
 * detected and flagged in the admin UI.
 *
 * Format: enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Key source: SETTINGS_ENCRYPTION_KEY env var — any string; SHA-256 is used
 * to derive a fixed 32-byte key so the env var can be any length.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSetting = encryptSetting;
exports.decryptSetting = decryptSetting;
exports.isEncryptedSetting = isEncryptedSetting;
const node_crypto_1 = require("node:crypto");
const PREFIX = 'enc:';
/** Derive a 32-byte AES key from the env var string via SHA-256. */
function deriveKey() {
    const raw = process.env.SETTINGS_ENCRYPTION_KEY;
    if (!raw)
        throw new Error('SETTINGS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt settings');
    return (0, node_crypto_1.createHash)('sha256').update(raw).digest();
}
/**
 * Encrypt a plain-text value.
 * Returns "enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>".
 * Throws if SETTINGS_ENCRYPTION_KEY is not configured.
 */
function encryptSetting(plaintext) {
    const key = deriveKey();
    const iv = (0, node_crypto_1.randomBytes)(12); // 96-bit IV recommended for GCM
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}
/**
 * Decrypt a value produced by encryptSetting().
 * If the value does not start with "enc:" it is returned as-is (legacy plain-text).
 * Throws if SETTINGS_ENCRYPTION_KEY is not configured and the value IS encrypted.
 */
function decryptSetting(value) {
    if (!value.startsWith(PREFIX))
        return value; // legacy — plain-text passthrough
    const key = deriveKey();
    const rest = value.slice(PREFIX.length);
    const parts = rest.split(':');
    if (parts.length !== 3)
        throw new Error('Malformed encrypted setting value');
    const [ivHex, tagHex, ctHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct).toString('utf8') + decipher.final('utf8');
}
/**
 * Returns true when the stored value was written by encryptSetting().
 * Returns false for legacy plain-text rows.
 */
function isEncryptedSetting(value) {
    return value.startsWith(PREFIX);
}
