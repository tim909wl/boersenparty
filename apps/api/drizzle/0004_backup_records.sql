CREATE TABLE backup_records(
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  status TEXT NOT NULL CHECK(status IN('VERIFIED','FAILED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
