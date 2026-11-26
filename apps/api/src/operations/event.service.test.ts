import { SchedulerRegistry } from '@nestjs/schedule';
import { MarketService } from '../market/market.service.js';
import { ChipRegistryService } from '../chip-registry/chip-registry.service.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { WristbandImportService } from '../import/wristband-import.service.js';
import { EventService } from './event.service.js';
import { id } from '../common/hash.js';

describe('EventService', () => {
  let db: DatabaseService, events: EventService;
  const now = Date.now();

  const addStaff = (count: number) => {
    for (let i = 0; i < count; i++) {db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run(`user-${i}`, `u${i}`, 'x', now);db.raw.prepare("INSERT INTO user_roles VALUES(?,'PAYMENT_LEAD')").run(`user-${i}`);}
  };
  const addProduct = () => {const product=id(),pv=id();db.raw.prepare("INSERT INTO products(id,name,category,base_price_cents,min_price_cents,max_price_cents,active,sold_out) VALUES(?,?,?,?,?,?,1,0)").run(product, 'Helles', 'Bier', 200, 100, 400);db.raw.prepare("INSERT INTO price_versions VALUES(?,1,'ACTIVE',?,?)").run(pv,now,now);db.raw.prepare('INSERT INTO price_entries VALUES(?,?,200)').run(pv,product);};

  beforeEach(() => {
    db = new DatabaseService(':memory:'); db.migrate();
    events = new EventService(db);for(const type of ['CASH_CLEARING','CARD_CLEARING','SALES','REFUND_CLEARING'])db.raw.prepare("INSERT INTO ledger_accounts VALUES(?,?,NULL,'EUR',?)").run(id(),type,now);
  });
  afterEach(() => db.onModuleDestroy());

  it('starts in preparation and refuses to open while required items are missing', () => {
    expect(events.state().phase).toBe('PREPARING');
    expect(() => events.open('Börsenparty 2026', 'user-0')).toThrow(/Noch offen/);
  });

  it('reports each checklist item from real data rather than a tick box', () => {
    addStaff(2); addProduct();
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    const required = events.checklist().filter(item => item.required);
    expect(required.every(item => item.ok)).toBe(true);
    expect(events.checklist().find(item => item.id === 'cash')?.ok).toBe(false);
  });

  it('opens the event, which also releases payments', () => {
    addStaff(2); addProduct();
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    const state = events.open('Börsenparty 2026', 'user-0');
    expect(state).toMatchObject({ phase: 'OPEN', name: 'Börsenparty 2026', mode: 'NORMAL' });
    expect(() => events.open('Zweite Party', 'user-0')).toThrow(/läuft bereits/);
  });

  it('stops payments when closing begins and refuses to finish while a cash session is open', () => {
    addStaff(2); addProduct();
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    events.open('Börsenparty 2026', 'user-0');
    db.raw.prepare("INSERT INTO terminals VALUES('terminal','T','BAR_A','ACTIVE',?)").run(now);
    db.raw.prepare("INSERT INTO cash_sessions(id,terminal_id,operator_id,opened_at,opening_cash_cents,status) VALUES(?,'terminal','user-0',?,0,'OPEN')").run(id(), now);

    expect(events.beginClosing('user-0').mode).toBe('PAYMENT_STOP');
    expect(() => events.close('user-0')).toThrow(/Kassensitzung/);

    db.raw.prepare("UPDATE cash_sessions SET status='CLOSED'").run();
    expect(()=>events.close('user-0')).toThrow(/nicht vollständig abgerechnet/);
    db.raw.prepare("UPDATE cash_sessions SET closed_at=?,counted_cash_cents=0,expected_cash_cents=0,difference_cents=0").run(now);
    expect(events.close('user-0').phase).toBe('CLOSED');
  });

  it('supports a safe step back while preserving an existing emergency stop',()=>{
    addStaff(2);addProduct();new WristbandImportService(db).importRows([{bandNumber:'0001',uid:'04A1B2C3D4E5F6'}]);events.open('Börsenparty','user-0');expect(events.stepBack('OPEN','user-0').phase).toBe('PREPARING');events.open('Börsenparty','user-0');const opened=events.state().openedAt;db.raw.prepare("UPDATE system_state SET mode='PAYMENT_STOP'").run();events.beginClosing('user-0');events.close('user-0');expect(events.stepBack('CLOSED','user-0').phase).toBe('CLOSING');expect(events.stepBack('CLOSING','user-0')).toMatchObject({phase:'OPEN',mode:'PAYMENT_STOP',openedAt:opened});expect(()=>events.stepBack('CLOSED','user-0')).toThrow(/geändert/);
  });
  it('keeps an explicit emergency stop ordered during closing after a phase rollback',()=>{addStaff(2);addProduct();new WristbandImportService(db).importRows([{bandNumber:'0001',uid:'04A1B2C3D4E5F6'}]);const market=new MarketService(db,new ChipRegistryService(db),new SchedulerRegistry());events.open('Börsenparty','user-0');events.beginClosing('user-0');market.setMode('PAYMENT_STOP','Emergency stop','user-1');expect(events.stepBack('CLOSING','user-0')).toMatchObject({phase:'OPEN',mode:'PAYMENT_STOP'});expect(()=>market.setMode('PRICE_FROZEN','Try to resume','user-0')).toThrow(/Vier-Augen/);expect(market.health().state).toMatchObject({mode:'PAYMENT_STOP'});});
  it('refuses to close without the announced sales stop', () => {
    addStaff(2); addProduct();
    new WristbandImportService(db).importRows([{ bandNumber: '0001', uid: '04A1B2C3D4E5F6' }]);
    events.open('Börsenparty 2026', 'user-0');
    expect(() => events.close('user-0')).toThrow(/Verkaufsende/);
  });
});
