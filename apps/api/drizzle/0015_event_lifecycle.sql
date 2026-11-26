-- The event gains an explicit lifecycle of its own, separate from the operational `mode` that
-- gates payments and from cash sessions. Additive columns only: no existing row, balance or
-- transaction is touched, and a database from before this migration simply starts in PREPARING.
ALTER TABLE system_state ADD COLUMN event_phase TEXT NOT NULL DEFAULT 'PREPARING';
ALTER TABLE system_state ADD COLUMN event_name TEXT;
ALTER TABLE system_state ADD COLUMN event_opened_at INTEGER;
ALTER TABLE system_state ADD COLUMN event_closed_at INTEGER;

-- An install that is already live (mode NORMAL and real money booked) is mid-event, not in
-- preparation — otherwise this migration would ask staff to "open" an event already running.
UPDATE system_state
SET event_phase = 'OPEN', event_opened_at = changed_at
WHERE id = 1 AND mode = 'NORMAL' AND EXISTS (SELECT 1 FROM financial_operations WHERE status = 'COMMITTED');
