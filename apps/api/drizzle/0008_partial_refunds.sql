ALTER TABLE refunds RENAME TO refunds_old;
CREATE TABLE refunds(
  id TEXT PRIMARY KEY,
  original_order_id TEXT NOT NULL REFERENCES orders(id),
  operation_id TEXT NOT NULL UNIQUE REFERENCES financial_operations(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  reason TEXT NOT NULL CHECK(length(reason)>=5),
  approved_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
INSERT INTO refunds SELECT * FROM refunds_old;
DROP TABLE refunds_old;
CREATE INDEX refunds_original_order ON refunds(original_order_id,created_at);
