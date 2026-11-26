-- Allow products with a fixed price of 0,00 (e.g. free tap water) to be quoted and purchased.
-- SQLite cannot ALTER a CHECK constraint in place, so the tables are rebuilt.
CREATE TABLE quotes_new(id TEXT PRIMARY KEY,price_version_id TEXT NOT NULL REFERENCES price_versions(id),total_cents INTEGER NOT NULL CHECK(total_cents>=0),items_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('OPEN','CONSUMED','EXPIRED')),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
INSERT INTO quotes_new SELECT id,price_version_id,total_cents,items_json,status,expires_at,created_at FROM quotes;
DROP TABLE quotes;
ALTER TABLE quotes_new RENAME TO quotes;

CREATE TABLE orders_new(id TEXT PRIMARY KEY,wallet_id TEXT NOT NULL REFERENCES wallets(id),quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),operation_id TEXT NOT NULL UNIQUE REFERENCES financial_operations(id),terminal_id TEXT REFERENCES terminals(id),total_cents INTEGER NOT NULL CHECK(total_cents>=0),status TEXT NOT NULL CHECK(status IN('PAID','REFUNDED')),created_at INTEGER NOT NULL);
INSERT INTO orders_new SELECT id,wallet_id,quote_id,operation_id,terminal_id,total_cents,status,created_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
