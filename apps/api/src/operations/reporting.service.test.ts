import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { MarketService } from '../market/market.service.js';
import { ChipRegistryService } from '../chip-registry/chip-registry.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { WristbandImportService } from '../import/wristband-import.service.js';
import { id } from '../common/hash.js';
import { ReportingService } from './reporting.service.js';

describe('ReportingService', () => {
  let db: DatabaseService, finance: FinanceService, reports: ReportingService;
  const actor = { sub: 'user', terminalId: 'terminal' };

  beforeEach(() => {
    db = new DatabaseService(':memory:'); db.migrate();
    const now = Date.now();
    db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run('user', 'u', 'x', now);
    db.raw.prepare("INSERT INTO terminals VALUES('terminal','T','BAR_A','ACTIVE',?)").run(now);
    db.raw.prepare("INSERT INTO cash_sessions(id,terminal_id,operator_id,opened_at,opening_cash_cents,status) VALUES(?,'terminal','user',?,0,'OPEN')").run(id(), now);
    for (const type of ['CASH_CLEARING', 'CARD_CLEARING', 'SALES', 'REFUND_CLEARING']) db.raw.prepare("INSERT INTO ledger_accounts VALUES(?,?,NULL,'EUR',?)").run(id(), type, now);
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    db.raw.prepare("UPDATE system_state SET mode='NORMAL',event_phase='OPEN'").run();
    finance = new FinanceService(db, new WalletService(db), new MarketService(db, new ChipRegistryService(db), new SchedulerRegistry()));
    reports = new ReportingService(db);
  });
  afterEach(() => db.onModuleDestroy());

  const makeQuote = (items: { name: string; quantity: number; unitPriceCents: number }[]) => {
    // Each purchase ticks the price engine, superseding the active version, so a hardcoded
    // version=1 would collide on the second call — always mint the next free version instead.
    const now = Date.now(), pv = id(), quote = id();
    const total = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
    const nextVersion = ((db.raw.prepare('SELECT MAX(version) v FROM price_versions').get() as any).v ?? 0) + 1;
    db.raw.prepare("UPDATE price_versions SET status='SUPERSEDED' WHERE status='ACTIVE'").run();
    db.raw.prepare("INSERT INTO price_versions VALUES(?,?,'ACTIVE',?,?)").run(pv, nextVersion, now, now);
    db.raw.prepare("INSERT INTO quotes VALUES(?,?,?,?,'OPEN',?,?)").run(quote, pv, total, JSON.stringify(items), now + 30000, now);
    return quote;
  };

  it('splits top-ups by funding method', () => {
    finance.topup({ uid: '04A1B2C3D4E5F6', amountCents: 1000, fundingMethod: 'CASH' }, 'k1', actor);
    finance.topup({ uid: '04A1B2C3D4E5F6', amountCents: 500, fundingMethod: 'CARD_VERIFIED', paymentReference: 'p1' }, 'k2', actor);
    const byMethod = reports.summary().topupsByMethod as any[];
    expect(byMethod.find(m => m.method === 'CASH')).toMatchObject({ count: 1, amountCents: 1000 });
    expect(byMethod.find(m => m.method === 'CARD_VERIFIED')).toMatchObject({ count: 1, amountCents: 500 });
  });

  it('aggregates revenue and quantity per product across orders', () => {
    finance.topup({ uid: '04A1B2C3D4E5F6', amountCents: 5000, fundingMethod: 'CASH' }, 'k3', actor);
    finance.purchase({ uid: '04A1B2C3D4E5F6', quoteId: makeQuote([{ name: 'Helles', quantity: 2, unitPriceCents: 300 }]) }, 'k4', actor);
    finance.purchase({ uid: '04A1B2C3D4E5F6', quoteId: makeQuote([{ name: 'Helles', quantity: 1, unitPriceCents: 300 }, { name: 'Radler', quantity: 1, unitPriceCents: 250 }]) }, 'k5', actor);
    const sales = reports.summary().productSales as any[];
    expect(sales.find(s => s.name === 'Helles')).toMatchObject({ quantity: 3, revenueCents: 900 });
    expect(sales.find(s => s.name === 'Radler')).toMatchObject({ quantity: 1, revenueCents: 250 });
  });
});
