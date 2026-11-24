CREATE UNIQUE INDEX IF NOT EXISTS topup_card_reference_unique
ON topups(payment_reference)
WHERE funding_method='CARD_VERIFIED' AND payment_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS refunds(
  id TEXT PRIMARY KEY,
  original_order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  operation_id TEXT NOT NULL UNIQUE REFERENCES financial_operations(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  reason TEXT NOT NULL CHECK(length(reason)>=5),
  approved_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
