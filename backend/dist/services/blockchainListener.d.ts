/**
 * Ethereum blockchain listener for AstroPaymentReceiver contract events.
 * Watches for PaymentReceived events, matches them to pending transactions,
 * and calls creditUser() to update balances automatically.
 */
export declare function startBlockchainListener(): void;
