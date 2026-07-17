/**
 * Bitcoin deposit monitor using Blockstream API.
 *
 * Flow:
 *  1. On startup, load all pending BTC deposits from the DB.
 *  2. Poll Blockstream every POLL_INTERVAL_MS for incoming txs on each address.
 *  3. After MIN_CONFIRMATIONS, atomically credit the user balance (idempotent).
 *
 * Address derivation:
 *  - Admin sets BTC_XPUB (account-level xpub, m/84'/0'/0' for native segwit).
 *  - Each deposit derives at m/0/<index> (external chain).
 *  - The deposit address is stored in the `btc_address` column (permanent).
 *  - The on-chain txid is stored in `tx_hash` only after confirmation.
 *
 * Safety properties:
 *  - Idempotent: status transition pending → confirmed is conditional, so
 *    replay/concurrency never double-credits.
 *  - Address uniqueness: enforced by DB partial index on btc_address, plus
 *    a unique-constraint + retry loop in the route.
 *  - A single bitcoin tx paying N deposit addresses credits N users correctly
 *    because the uniqueness key is btc_address, not the on-chain txid.
 */
/**
 * Return the active BTC xpub.
 * Priority: BTC_XPUB env var → system_settings DB row → null (not configured).
 * The result is cached until `clearXpubCache()` is called.
 */
export declare function getXpub(): Promise<string | null>;
/** Call after saving/deleting xpub from DB so the next poll picks it up */
export declare function clearXpubCache(): void;
/**
 * Derive a native-segwit (P2WPKH / bech32) BTC address from an xpub or zpub.
 * Path convention: m/0/<index>  (external chain, one address per deposit).
 *
 * Sparrow Wallet exports "zpub…" for Native Segwit (P2WPKH) accounts.
 * zpub uses version bytes 0x04b24746 instead of xpub's 0x0488b21e — the
 * underlying key material is identical; we just pass the matching network
 * object so bip32.fromBase58() accepts the prefix.
 */
export declare function deriveBtcAddress(xpub: string, index: number): string;
/**
 * Seed the in-memory BTC price cache from the database on startup.
 * This means a cold restart does not lose the last known price, so
 * the `pending_price` retry loop can re-price deposits immediately.
 */
export declare function loadBtcPriceCacheFromDb(): Promise<void>;
export declare function startBtcMonitor(): void;
