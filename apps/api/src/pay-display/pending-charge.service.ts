import { Injectable } from '@nestjs/common';

// A guest-facing "Bezahldisplay" tap-to-pay screen is a second device at the register: the
// cashier builds the cart/amount on their own terminal, pushes it here, and the display (which
// has its own NFC reader) auto-completes the payment the instant the guest taps — no staff click.
// This is purely UI-sync state, not financial data, so it lives in memory only: if the API
// restarts mid-handoff nothing financial has happened yet, the cashier just re-sends it.
// Plain Omit<Union, K> collapses to only the keys common across every branch (keyof a union is
// their intersection), silently dropping quoteId/amountCents/etc — intersecting the union with
// {createdAt} instead distributes correctly and keeps each branch's own fields.
export type PendingChargeInput =
  | { type: 'purchase'; quoteId: string; totalCents: number; items: { name: string; quantity: number; unitPriceCents: number }[] }
  | { type: 'topup'; amountCents: number; fundingMethod: 'CASH' | 'CARD_VERIFIED'; paymentReference?: string };
export type PendingCharge = PendingChargeInput & { createdAt: number };

const TTL_MS = 90_000;

@Injectable()
export class PendingChargeService {
  private charges = new Map<string, PendingCharge>();

  set(terminalId: string, charge: PendingChargeInput) {
    this.charges.set(terminalId, { ...charge, createdAt: Date.now() });
  }
  get(terminalId: string): PendingCharge | null {
    const c = this.charges.get(terminalId);
    if (c && Date.now() - c.createdAt > TTL_MS) { this.charges.delete(terminalId); return null; }
    return c ?? null;
  }
  clear(terminalId: string,expectedQuoteId?:string) {const c=this.get(terminalId);if(expectedQuoteId&&(!c||c.type!=='purchase'||c.quoteId!==expectedQuoteId))return false;return this.charges.delete(terminalId);}
}
