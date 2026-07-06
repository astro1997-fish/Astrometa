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
 * Derive a native-segwit (P2WPKH / bech32) BTC address from an xpub.
 * Path convention: m/0/<index>  (external chain, one address per deposit).
 */
export declare function deriveBtcAddress(xpub: string, index: number): string;
export declare function startBtcMonitor(): void;
