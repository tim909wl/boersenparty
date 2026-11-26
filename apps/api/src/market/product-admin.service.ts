import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../common/domain-error.js';
import { id } from '../common/hash.js';
import { appendAudit } from '../common/audit.js';

type ProductInput = { name: string; category: string; basePriceCents: number; minPriceCents: number; maxPriceCents: number };

function validateRange(x: ProductInput) {
  if (!x.name.trim()) throw new DomainError('NAME_REQUIRED', 'Product name is required', 400);
  if (!x.category.trim()) throw new DomainError('CATEGORY_REQUIRED', 'Category is required', 400);
  for (const [k, v] of Object.entries({ basePriceCents: x.basePriceCents, minPriceCents: x.minPriceCents, maxPriceCents: x.maxPriceCents })) {
    if (!Number.isInteger(v) || v < 0) throw new DomainError('INVALID_PRICE', `${k} must be a non-negative whole number of cents`, 400);
  }
  if (!(x.minPriceCents <= x.basePriceCents && x.basePriceCents <= x.maxPriceCents)) throw new DomainError('INVALID_PRICE_RANGE', 'Required: min <= base <= max', 400);
}

@Injectable() export class ProductAdminService {
  constructor(private db: DatabaseService) {}

  list() {
    return this.db.raw.prepare(`
      SELECT p.id,p.name,p.category,p.base_price_cents basePriceCents,p.min_price_cents minPriceCents,p.max_price_cents maxPriceCents,p.active,p.sold_out soldOut,pe.price_cents currentPriceCents
      FROM products p LEFT JOIN price_entries pe ON pe.product_id=p.id AND pe.price_version_id=(SELECT id FROM price_versions WHERE status='ACTIVE')
      ORDER BY p.category,p.name
    `).all().map((x: any) => ({ ...x, active: Boolean(x.active), soldOut: Boolean(x.soldOut) }));
  }

  create(input: ProductInput, actorId: string) {
    validateRange(input);
    return this.db.raw.transaction(() => {
      const productId = id();
      this.db.raw.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,1,0)').run(productId, input.name.trim(), input.category.trim(), input.basePriceCents, input.minPriceCents, input.maxPriceCents);
      const active = this.db.raw.prepare("SELECT id FROM price_versions WHERE status='ACTIVE'").get() as any;
      if (active) this.db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(active.id, productId, input.basePriceCents);
      appendAudit(this.db.raw, { actorId, action: 'PRODUCT_CREATED', entityType: 'product', entityId: productId, payload: input });
      return { id: productId, ...input, active: true, soldOut: false };
    }).immediate();
  }

  update(productId: string, patch: Partial<ProductInput & { active: boolean; soldOut: boolean }>, actorId: string) {
    return this.db.raw.transaction(() => {
      const current = this.db.raw.prepare('SELECT id,name,category,base_price_cents basePriceCents,min_price_cents minPriceCents,max_price_cents maxPriceCents,active,sold_out soldOut FROM products WHERE id=?').get(productId) as any;
      if (!current) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found', 404);
      const merged: ProductInput = {
        name: patch.name ?? current.name, category: patch.category ?? current.category,
        basePriceCents: patch.basePriceCents ?? current.basePriceCents, minPriceCents: patch.minPriceCents ?? current.minPriceCents, maxPriceCents: patch.maxPriceCents ?? current.maxPriceCents,
      };
      validateRange(merged);
      const active = patch.active ?? Boolean(current.active);
      const soldOut = patch.soldOut ?? Boolean(current.soldOut);
      this.db.raw.prepare('UPDATE products SET name=?,category=?,base_price_cents=?,min_price_cents=?,max_price_cents=?,active=?,sold_out=? WHERE id=?')
        .run(merged.name.trim(), merged.category.trim(), merged.basePriceCents, merged.minPriceCents, merged.maxPriceCents, active ? 1 : 0, soldOut ? 1 : 0, productId);
      // An explicit new base price means "start the market fresh here" — snap the live price to
      // it directly rather than just clamping the old price into the new range, otherwise e.g.
      // dropping the base from 3,00€ to 1,50€ while also narrowing max to 2,50€ would leave the
      // board showing 2,50€ (clamped to the new max) instead of the 1,50€ that was actually asked
      // for. An update that only narrows min/max without touching base keeps the old clamp-only
      // behavior, so an unrelated edit mid-event doesn't erase a live crash/trend.
      const activeVersion = this.db.raw.prepare("SELECT id FROM price_versions WHERE status='ACTIVE'").get() as any;
      if (activeVersion) {
        const entry = this.db.raw.prepare('SELECT price_cents priceCents FROM price_entries WHERE price_version_id=? AND product_id=?').get(activeVersion.id, productId) as any;
        if (entry) {
          const target = patch.basePriceCents !== undefined ? merged.basePriceCents : Math.max(merged.minPriceCents, Math.min(merged.maxPriceCents, entry.priceCents));
          if (target !== entry.priceCents) this.db.raw.prepare('UPDATE price_entries SET price_cents=? WHERE price_version_id=? AND product_id=?').run(target, activeVersion.id, productId);
        } else {
          this.db.raw.prepare('INSERT INTO price_entries VALUES(?,?,?)').run(activeVersion.id, productId, merged.basePriceCents);
        }
      }
      appendAudit(this.db.raw, { actorId, action: 'PRODUCT_UPDATED', entityType: 'product', entityId: productId, payload: { ...merged, active, soldOut } });
      return { id: productId, ...merged, active, soldOut };
    }).immediate();
  }
}
