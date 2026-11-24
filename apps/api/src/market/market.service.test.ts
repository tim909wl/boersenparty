import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { id } from '../common/hash.js';
import { DatabaseService } from '../database/database.service.js';
import { MarketService } from './market.service.js';

describe('MarketService history',()=>{
  let db:DatabaseService;
  let market:MarketService;
  beforeEach(()=>{db=new DatabaseService(':memory:');db.migrate();market=new MarketService(db)});
  afterEach(()=>db.onModuleDestroy());

  it('returns real price versions in chronological order',()=>{
    const product=id(),first=id(),second=id();
    db.raw.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,1,0)').run(product,'Cola','Alkoholfrei',250,150,400);
    db.raw.prepare("INSERT INTO price_versions VALUES(?,1,'SUPERSEDED',1000,1000)").run(first);
    db.raw.prepare("INSERT INTO price_versions VALUES(?,2,'ACTIVE',2000,2000)").run(second);
    db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(first,product,250);
    db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(second,product,275);

    expect(market.history()).toEqual({points:[
      {version:1,effectiveAt:1000,prices:{[product]:250}},
      {version:2,effectiveAt:2000,prices:{[product]:275}},
    ]});
  });

  it('refuses to quote a sold-out product, and list() reports it as sold out',()=>{
    const product=id(),pv=id();
    db.raw.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,1,1)').run(product,'Cola','Alkoholfrei',250,150,400);
    db.raw.prepare("INSERT INTO price_versions VALUES(?,1,'ACTIVE',?,?)").run(pv,Date.now(),Date.now());
    db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(pv,product,250);
    expect((market.list() as any[])[0].soldOut).toBe(true);
    expect(()=>market.quote([{productId:product,quantity:1}])).toThrow(/ausverkauft/i);
  });
});

describe('MarketService crash',()=>{
  let db:DatabaseService;
  let market:MarketService;
  let product:string;
  let other:string;
  const actorId='manager-1';
  const priceOf=(p:string)=>(market.list() as any[]).find(x=>x.id===p).priceCents;
  beforeEach(()=>{
    db=new DatabaseService(':memory:');db.migrate();market=new MarketService(db);
    db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run(actorId,'manager','x',Date.now());
    db.raw.prepare("UPDATE system_state SET mode='NORMAL'").run();
    product=id();other=id();
    db.raw.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,1,0)').run(product,'Cola','Alkoholfrei',250,150,400);
    db.raw.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,1,0)').run(other,'Wasser','Alkoholfrei',200,150,300);
    const pv=id();
    db.raw.prepare("INSERT INTO price_versions VALUES(?,1,'ACTIVE',?,?)").run(pv,Date.now(),Date.now());
    db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(pv,product,250);
    db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(pv,other,200);
  });
  afterEach(()=>db.onModuleDestroy());

  it('forces every variable-priced product to its minimum and records the crash state',()=>{
    const result=market.startCrash(5,'CRASH',actorId);
    expect(result.crashKind).toBe('CRASH');
    expect(result.crashUntil).toBeGreaterThan(Date.now());
    expect(priceOf(product)).toBe(150);
    const state=db.raw.prepare('SELECT crash_until crashUntil,crash_kind crashKind FROM system_state WHERE id=1').get() as any;
    expect(state.crashKind).toBe('CRASH');
    expect(state.crashUntil).toBe(result.crashUntil);
  });

  it('keeps forcing the minimum price on every tick while the crash is active',()=>{
    market.startCrash(5,'CRASH',actorId);
    const activeVersion=db.raw.prepare("SELECT id FROM price_versions WHERE status='ACTIVE'").get() as any;
    db.raw.prepare("INSERT INTO quotes VALUES(?,?,300,?,'CONSUMED',?,?)").run(id(),activeVersion.id,JSON.stringify([{productId:product,quantity:10}]),Date.now()+30000,Date.now());
    market.tick();
    expect(priceOf(product)).toBe(150);
  });

  it('rejects starting a crash while the market is not running',()=>{
    db.raw.prepare("UPDATE system_state SET mode='PAYMENT_STOP'").run();
    expect(()=>market.startCrash(5,'CRASH',actorId)).toThrow(/running/);
  });

  it('rejects starting a crash when one is already active',()=>{
    market.startCrash(5,'CRASH',actorId);
    expect(()=>market.startCrash(5,'CRASH',actorId)).toThrow(/already running/);
  });

  it('rejects an out-of-range duration',()=>{
    expect(()=>market.startCrash(0,'CRASH',actorId)).toThrow(/1 and 30/);
    expect(()=>market.startCrash(31,'CRASH',actorId)).toThrow(/1 and 30/);
  });

  it('stopCrash clears the crash state and rejects when nothing is active',()=>{
    expect(()=>market.stopCrash(actorId)).toThrow(/No crash/);
    market.startCrash(5,'CRASH',actorId);
    const result=market.stopCrash(actorId);
    expect(result.crashUntil).toBe(0);
    const state=db.raw.prepare('SELECT crash_until crashUntil,crash_kind crashKind FROM system_state WHERE id=1').get() as any;
    expect(state.crashUntil).toBe(0);
    expect(state.crashKind).toBeNull();
  });

  it('stopCrash immediately restores the base price instead of leaving it at the crash floor',()=>{
    market.startCrash(5,'CRASH',actorId);
    expect(priceOf(product)).toBe(150);
    market.stopCrash(actorId);
    expect(priceOf(product)).toBe(250);
  });

  it('restores the base price on the first tick after a crash expires naturally, instead of staying stuck at the floor',()=>{
    market.startCrash(1,'CRASH',actorId);
    expect(priceOf(product)).toBe(150);
    db.raw.prepare('UPDATE system_state SET crash_until=? WHERE id=1').run(Date.now()-1000);
    market.tick();
    expect(priceOf(product)).toBe(250);
    const state=db.raw.prepare('SELECT crash_until crashUntil,crash_kind crashKind FROM system_state WHERE id=1').get() as any;
    expect(state.crashUntil).toBe(0);
    expect(state.crashKind).toBeNull();
  });

  it('does not keep resetting to base on later ticks once the crash has already been resolved',()=>{
    market.startCrash(1,'CRASH',actorId);
    db.raw.prepare('UPDATE system_state SET crash_until=? WHERE id=1').run(Date.now()-1000);
    market.tick();
    const activeVersion=db.raw.prepare("SELECT id FROM price_versions WHERE status='ACTIVE'").get() as any;
    db.raw.prepare("INSERT INTO quotes VALUES(?,?,300,?,'CONSUMED',?,?)").run(id(),activeVersion.id,JSON.stringify([{productId:product,quantity:10}]),Date.now()+30000,Date.now());
    market.tick();
    expect(priceOf(product)).toBeGreaterThan(250);
  });
});
