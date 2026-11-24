CREATE TABLE approval_requests(
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN('REFUND')),
  payload_json TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id),
  requested_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN('PENDING','APPROVED','REJECTED','EXPIRED')),
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  executed_at INTEGER,
  result_json TEXT,
  rejection_reason TEXT,
  CHECK(approved_by IS NULL OR approved_by<>requested_by)
);
CREATE INDEX approval_status_expiry ON approval_requests(status,expires_at);
