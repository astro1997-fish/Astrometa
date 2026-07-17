export declare const emailService: {
    sendWelcome(email: string, name: string): Promise<void>;
    sendDepositConfirmed(email: string, name: string, amount: number): Promise<void>;
    sendInvestmentActivated(email: string, name: string, packageType: string, amount: number): Promise<void>;
    sendSupportNotification(ticket: {
        name: string;
        email: string;
        subject: string;
        message: string;
    }): Promise<void>;
    /**
     * Notifies admins whenever a deposit is manually overridden/credited by an
     * admin (rather than the automatic blockchain listener), so the whole team
     * stays aware of overrides in real time for fraud detection and compliance.
     */
    sendAdminOverrideAlert(details: {
        amountUsd: number;
        adminName: string;
        mode: 'manual' | 'chain';
        txId: string;
    }): Promise<void>;
    /**
     * Sends an alert to the admin when the Ethereum blockchain listener appears
     * to have stalled or lost its provider connection.
     */
    sendListenerAlert(reason: string, details: string): Promise<void>;
};
