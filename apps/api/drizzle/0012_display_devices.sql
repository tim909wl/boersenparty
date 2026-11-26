-- Central registry of every display/terminal that has ever loaded the public board, so the admin
-- panel can see every device's online status and last self-test result in one place, and so a
-- fleet-wide diagnostics run can be triggered centrally instead of walking around with a laptop.
CREATE TABLE display_devices(
  id TEXT PRIMARY KEY,
  name TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_diagnostic_at INTEGER,
  diagnostic_result_json TEXT
);

ALTER TABLE system_state ADD COLUMN diagnostics_requested_at INTEGER NOT NULL DEFAULT 0;
