-- Explicit payment stop is independent of the event phase.
ALTER TABLE system_state ADD COLUMN manual_payment_stop INTEGER NOT NULL DEFAULT 0 CHECK(manual_payment_stop IN (0,1));
UPDATE system_state SET manual_payment_stop=1 WHERE (event_phase='OPEN' AND mode='PAYMENT_STOP') OR (event_phase IN ('CLOSING','CLOSED') AND event_resume_mode='PAYMENT_STOP') OR COALESCE((SELECT json_extract(payload_json,'$.mode') FROM audit_events WHERE action='SYSTEM_MODE_CHANGED' ORDER BY rowid DESC LIMIT 1),'')='PAYMENT_STOP';
UPDATE system_state SET mode='PAYMENT_STOP',reason='Bestehende Notabschaltung beibehalten' WHERE manual_payment_stop=1 AND mode<>'PAYMENT_STOP';
CREATE TABLE quote_owners(quote_id TEXT PRIMARY KEY REFERENCES quotes(id) ON DELETE CASCADE, operator_id TEXT NOT NULL REFERENCES users(id), terminal_id TEXT NOT NULL REFERENCES terminals(id));
UPDATE quotes SET status='EXPIRED' WHERE status='OPEN';
CREATE TABLE market_demand_cursor(id INTEGER PRIMARY KEY CHECK(id=1), last_order_rowid INTEGER NOT NULL);
INSERT INTO market_demand_cursor VALUES(1,COALESCE((SELECT MAX(rowid) FROM orders),0));
CREATE INDEX IF NOT EXISTS quotes_expiry_idx ON quotes(status,expires_at);
CREATE INDEX IF NOT EXISTS auth_attempts_address_time_idx ON auth_attempts(remote_address,created_at);
-- Old guest display tokens are indistinguishable from staff tokens. Revoke every old session.
UPDATE users SET auth_version=auth_version+1;
