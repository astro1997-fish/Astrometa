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
};
