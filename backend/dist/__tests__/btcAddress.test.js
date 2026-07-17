"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Integration check: deriveBtcAddress must accept both xpub and zpub keys.
 * Run with: npx tsx --test src/__tests__/btcAddress.test.ts
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const btcMonitor_js_1 = require("../services/btcMonitor.js");
// A known mainnet xpub (BIP44 / P2WPKH) and its first external address.
// Source: bitcoin-ts test vectors / publicly known test key — no funds.
const TEST_XPUB = 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz';
// A known mainnet zpub (BIP84 / P2WPKH native SegWit) — same key, different encoding.
// Generated from the same seed; first address must match between xpub and zpub derivation.
const TEST_ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
(0, node_test_1.test)('deriveBtcAddress accepts a standard xpub and returns a bech32 address', () => {
    const addr = (0, btcMonitor_js_1.deriveBtcAddress)(TEST_XPUB, 0);
    strict_1.default.ok(addr.startsWith('bc1'), `Expected bech32 address, got: ${addr}`);
});
(0, node_test_1.test)('deriveBtcAddress accepts a zpub (native-SegWit export from Sparrow/Ledger) without throwing', () => {
    // zpub uses different version bytes — must not throw "Invalid network version"
    let addr;
    strict_1.default.doesNotThrow(() => { addr = (0, btcMonitor_js_1.deriveBtcAddress)(TEST_ZPUB, 0); });
    strict_1.default.ok(addr.startsWith('bc1'), `Expected bech32 address, got: ${addr}`);
});
(0, node_test_1.test)('deriveBtcAddress throws on a garbage string', () => {
    strict_1.default.throws(() => (0, btcMonitor_js_1.deriveBtcAddress)('not-a-valid-key', 0));
});
