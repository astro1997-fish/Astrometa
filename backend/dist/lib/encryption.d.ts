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
/**
 * Encrypt a plain-text value.
 * Returns "enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>".
 * Throws if SETTINGS_ENCRYPTION_KEY is not configured.
 */
export declare function encryptSetting(plaintext: string): string;
/**
 * Decrypt a value produced by encryptSetting().
 * If the value does not start with "enc:" it is returned as-is (legacy plain-text).
 * Throws if SETTINGS_ENCRYPTION_KEY is not configured and the value IS encrypted.
 */
export declare function decryptSetting(value: string): string;
/**
 * Returns true when the stored value was written by encryptSetting().
 * Returns false for legacy plain-text rows.
 */
export declare function isEncryptedSetting(value: string): boolean;
