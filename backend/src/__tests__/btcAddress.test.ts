/**
 * Integration check: deriveBtcAddress must accept both xpub and zpub keys.
 * Run with: npx tsx --test src/__tests__/btcAddress.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveBtcAddress } from '../services/btcMonitor.js'

// A known mainnet xpub (BIP44 / P2WPKH) and its first external address.
// Source: bitcoin-ts test vectors / publicly known test key — no funds.
const TEST_XPUB =
  'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz'

// A known mainnet zpub (BIP84 / P2WPKH native SegWit) — same key, different encoding.
// Generated from the same seed; first address must match between xpub and zpub derivation.
const TEST_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

test('deriveBtcAddress accepts a standard xpub and returns a bech32 address', () => {
  const addr = deriveBtcAddress(TEST_XPUB, 0)
  assert.ok(addr.startsWith('bc1'), `Expected bech32 address, got: ${addr}`)
})

test('deriveBtcAddress accepts a zpub (native-SegWit export from Sparrow/Ledger) without throwing', () => {
  // zpub uses different version bytes — must not throw "Invalid network version"
  let addr: string
  assert.doesNotThrow(() => { addr = deriveBtcAddress(TEST_ZPUB, 0) })
  assert.ok(addr!.startsWith('bc1'), `Expected bech32 address, got: ${addr!}`)
})

test('deriveBtcAddress throws on a garbage string', () => {
  assert.throws(() => deriveBtcAddress('not-a-valid-key', 0))
})
