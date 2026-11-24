export type Role = 'BAR' | 'TOPUP' | 'MARKET_MANAGER' | 'PAYMENT_LEAD' | 'ADMIN' | 'AUDITOR';
export type SystemMode = 'NORMAL' | 'PRICE_FROZEN' | 'PAYMENT_STOP';
export type FundingMethod = 'CASH' | 'CARD_VERIFIED';

export interface WalletView {
  walletId: string;
  bandNumber: string;
  balanceCents: number;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
}

export interface TopupRequest { uid: string; amountCents: number; fundingMethod: FundingMethod; paymentReference?: string }
export interface PurchaseRequest { uid: string; quoteId: string }
export interface ApiError { statusCode: number; code: string; message: string; correlationId?: string }
