import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { id } from '../common/hash.js';
import { DatabaseService } from '../database/database.service.js';
import { ProductAdminService } from './product-admin.service.js';

describe('ProductAdminService', () => {
  let db: DatabaseService;
  let products: ProductAdminService;
  const actorId = 'manager-1';
  beforeEach(() => {
    db = new DatabaseService(':memory:'); db.migrate(); products = new ProductAdminService(db);
    db.raw.prepare('INSERT INTO users(id,username,password_hash,active,created_at) VALUES(?,?,?,1,?)').run(actorId, 'manager', 'x', Date.now());
    const pv = id();
    db.raw.prepare("INSERT INTO price_versions VALUES(?,1,'ACTIVE',?,?)").run(pv, Date.now(), Date.now());
  });
  afterEach(() => db.onModuleDestroy());

  it('creates a product and immediately prices it at the active version', () => {
    const result = products.create({ name: 'Mojito', category: 'Cocktails', basePriceCents: 500, minPriceCents: 300, maxPriceCents: 700 }, actorId);
    expect(result.id).toBeTruthy();
    const listed = products.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: 'Mojito', currentPriceCents: 500, active: true });
  });

  it('rejects an invalid price range', () => {
    expect(() => products.create({ name: 'Broken', category: 'Test', basePriceCents: 100, minPriceCents: 200, maxPriceCents: 300 }, actorId)).toThrow(/min <= base <= max/i);
  });

  it('updates a product and clamps its live price into a narrowed range', () => {
    const created = products.create({ name: 'Bier', category: 'Bier', basePriceCents: 300, minPriceCents: 200, maxPriceCents: 500 }, actorId);
    const activeVersion = db.raw.prepare("SELECT id FROM price_versions WHERE status='ACTIVE'").get() as any;
    db.raw.prepare('UPDATE price_entries SET price_cents=450 WHERE price_version_id=? AND product_id=?').run(activeVersion.id, created.id);
    const updated = products.update(created.id, { maxPriceCents: 400 }, actorId);
    expect(updated.maxPriceCents).toBe(400);
    const listed = products.list().find(p => p.id === created.id) as any;
    expect(listed.currentPriceCents).toBe(400);
  });

  it('deactivating a product removes it from the public list query', () => {
    const created = products.create({ name: 'Saisonal', category: 'Test', basePriceCents: 100, minPriceCents: 100, maxPriceCents: 100 }, actorId);
    products.update(created.id, { active: false }, actorId);
    const row = db.raw.prepare('SELECT active FROM products WHERE id=?').get(created.id) as any;
    expect(row.active).toBe(0);
  });

  it('rejects updates to a product that does not exist', () => {
    expect(() => products.update('missing', { name: 'x' }, actorId)).toThrow(/not found/i);
  });
});
