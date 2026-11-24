CREATE TABLE cash_sessions(
  id TEXT PRIMARY KEY,
  terminal_id TEXT NOT NULL REFERENCES terminals(id),
  operator_id TEXT NOT NULL REFERENCES users(id),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_cash_cents INTEGER NOT NULL CHECK(opening_cash_cents>=0),
  counted_cash_cents INTEGER CHECK(counted_cash_cents>=0),
  expected_cash_cents INTEGER CHECK(expected_cash_cents>=0),
  difference_cents INTEGER,
  status TEXT NOT NULL CHECK(status IN('OPEN','CLOSED')),
  close_reason TEXT
);
CREATE UNIQUE INDEX one_open_cash_session_per_terminal ON cash_sessions(terminal_id) WHERE status='OPEN';

CREATE TABLE cash_session_operations(
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  operation_id TEXT NOT NULL UNIQUE REFERENCES financial_operations(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents<>0),
  kind TEXT NOT NULL CHECK(kind IN('TOPUP','PAYOUT','ADJUSTMENT')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(cash_session_id,operation_id)
);
