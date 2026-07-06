/**
 * Returns the appropriate block-explorer URL for a transaction hash or address.
 *
 * - BTC txid  (64 hex chars)       → mempool.space/tx/<txid>
 * - BTC address (bc1… / 1… / 3…)  → mempool.space/address/<address>
 * - Anything else (ETH / ERC-20)   → etherscan.io/tx/<hash>
 */
export function txExplorerUrl(txHash: string, method?: string | null): string {
  if (method === 'btc') {
    // Confirmed txid: 64 lowercase hex characters
    if (/^[0-9a-fA-F]{64}$/.test(txHash)) {
      return `https://mempool.space/tx/${txHash}`
    }
    // Deposit address (native segwit bc1…, legacy 1…, p2sh 3…)
    if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(txHash)) {
      return `https://mempool.space/address/${txHash}`
    }
    // Fallback: let mempool.space figure it out
    return `https://mempool.space/tx/${txHash}`
  }

  return `https://etherscan.io/tx/${txHash}`
}

/** Short display label for a hash/address */
export function txShortLabel(txHash: string): string {
  return `${txHash.slice(0, 8)}…${txHash.slice(-6)}`
}
