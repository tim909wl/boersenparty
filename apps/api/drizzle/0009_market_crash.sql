ALTER TABLE system_state ADD COLUMN crash_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE system_state ADD COLUMN crash_kind TEXT;
