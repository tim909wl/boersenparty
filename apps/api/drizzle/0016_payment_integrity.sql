-- Add missing zero-balance wallet accounts without changing any balance or posting money.
INSERT INTO ledger_accounts(id,type,wallet_id,currency,created_at)
SELECT lower(hex(randomblob(16))),'WALLET',w.id,'EUR',CAST(unixepoch('subsec')*1000 AS INTEGER)
FROM wallets w WHERE w.balance_cents=0 AND NOT EXISTS(SELECT 1 FROM ledger_accounts a WHERE a.wallet_id=w.id);
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_clearing_one ON ledger_accounts(type) WHERE wallet_id IS NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_id);
CREATE TRIGGER IF NOT EXISTS wallet_create_ledger AFTER INSERT ON wallets BEGIN
  INSERT INTO ledger_accounts(id,type,wallet_id,currency,created_at)
  VALUES(lower(hex(randomblob(16))),'WALLET',NEW.id,'EUR',NEW.created_at);
END;
