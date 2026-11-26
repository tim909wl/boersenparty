-- A free drink is an entitlement, never cash or wallet credit.
CREATE TABLE free_drink_entitlements (
 wallet_id TEXT PRIMARY KEY REFERENCES wallets(id),
 granted_by TEXT NOT NULL REFERENCES users(id),
 granted_at INTEGER NOT NULL,
 redeemed_order_id TEXT UNIQUE REFERENCES orders(id),
 redeemed_at INTEGER,
 product_id TEXT REFERENCES products(id),
 original_price_cents INTEGER CHECK(original_price_cents > 0),
 CHECK ((redeemed_order_id IS NULL AND redeemed_at IS NULL AND product_id IS NULL AND original_price_cents IS NULL) OR (redeemed_order_id IS NOT NULL AND redeemed_at IS NOT NULL AND product_id IS NOT NULL AND original_price_cents IS NOT NULL))
);

-- Preserve a deliberate emergency stop across a lifecycle rollback.
ALTER TABLE system_state ADD COLUMN event_resume_mode TEXT NOT NULL DEFAULT 'PAYMENT_STOP' CHECK(event_resume_mode IN('NORMAL','PRICE_FROZEN','PAYMENT_STOP'));
