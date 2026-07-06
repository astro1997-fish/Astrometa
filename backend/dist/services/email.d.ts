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
     * Sends an alert to the admin when the Ethereum blockchain listener appears
     * to have stalled or lost its provider connection.
     */
    sendListenerAlert(reason: string, details: string): Promise<void>;
};
