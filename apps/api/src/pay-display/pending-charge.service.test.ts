import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingChargeService } from './pending-charge.service.js';

describe('PendingChargeService', () => {
  let charges: PendingChargeService;
  beforeEach(() => { charges = new PendingChargeService(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('returns null for a terminal with nothing pending', () => {
    expect(charges.get('terminal-a')).toBeNull();
  });

  it('round-trips a pending purchase charge', () => {
    charges.set('terminal-a', { type: 'purchase', quoteId: 'q1', totalCents: 500, items: [{ name: 'Helles', quantity: 2, unitPriceCents: 250 }] });
    expect(charges.get('terminal-a')).toMatchObject({ type: 'purchase', quoteId: 'q1', totalCents: 500 });
  });

  it('keeps charges isolated per terminal', () => {
    charges.set('terminal-a', { type: 'topup', amountCents: 1000, fundingMethod: 'CASH' });
    expect(charges.get('terminal-b')).toBeNull();
  });

  it('clears a charge explicitly', () => {
    charges.set('terminal-a', { type: 'topup', amountCents: 1000, fundingMethod: 'CASH' });
    charges.clear('terminal-a');
    expect(charges.get('terminal-a')).toBeNull();
  });

  it('expires a stale charge nobody picked up', () => {
    charges.set('terminal-a', { type: 'topup', amountCents: 1000, fundingMethod: 'CASH' });
    vi.advanceTimersByTime(91_000);
    expect(charges.get('terminal-a')).toBeNull();
  });
});
