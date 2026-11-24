ALTER TABLE backup_records ADD COLUMN secondary_path TEXT;
ALTER TABLE backup_records ADD COLUMN secondary_sha256 TEXT;
ALTER TABLE backup_records ADD COLUMN replicated_at INTEGER;

CREATE TABLE report_exports(
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  hmac_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
