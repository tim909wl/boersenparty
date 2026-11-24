ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_login_count>=0);
ALTER TABLE users ADD COLUMN last_failed_at INTEGER;
ALTER TABLE users ADD COLUMN locked_until INTEGER;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;

CREATE TABLE auth_attempts(
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  terminal_id TEXT,
  remote_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL CHECK(success IN(0,1)),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_username_time ON auth_attempts(username,created_at);
