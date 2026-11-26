-- Tyvek bands have only a printed number and deliberately no NFC UID. Existing bands are NFC.
CREATE TABLE wristbands_new(
  id TEXT PRIMARY KEY,
  band_number TEXT NOT NULL UNIQUE,
  uid_hex TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'NFC' CHECK(kind IN('NFC','TYVEK')),
  status TEXT NOT NULL DEFAULT 'IMPORTED' CHECK(status IN('IMPORTED','ACTIVE','BLOCKED','RETIRED')),
  created_at INTEGER NOT NULL,
  CHECK(
    (kind='TYVEK' AND uid_hex IS NULL) OR
    (kind='NFC' AND uid_hex IS NOT NULL AND uid_hex NOT GLOB '*[^0-9A-F]*' AND length(uid_hex) IN(8,14,20))
  )
);
INSERT INTO wristbands_new(id,band_number,uid_hex,kind,status,created_at)
SELECT id,band_number,uid_hex,'NFC',status,created_at FROM wristbands;
DROP TABLE wristbands;
ALTER TABLE wristbands_new RENAME TO wristbands;

CREATE TABLE financial_operations_new(
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN('TOPUP','PURCHASE','REFUND','ADJUSTMENT','STARTING_BALANCE')),
  status TEXT NOT NULL CHECK(status IN('PENDING','COMMITTED','REJECTED')),
  terminal_id TEXT REFERENCES terminals(id),
  operator_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  response_json TEXT
);
INSERT INTO financial_operations_new SELECT * FROM financial_operations;
DROP TABLE financial_operations;
ALTER TABLE financial_operations_new RENAME TO financial_operations;

-- A dedicated contra account keeps complimentary starting credit separate from cash/card money.
CREATE TABLE ledger_accounts_new(
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN('WALLET','CASH_CLEARING','CARD_CLEARING','SALES','REFUND_CLEARING','STARTING_BALANCE')),
  wallet_id TEXT UNIQUE REFERENCES wallets(id),
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at INTEGER NOT NULL,
  CHECK((type='WALLET' AND wallet_id IS NOT NULL) OR (type<>'WALLET' AND wallet_id IS NULL))
);
INSERT INTO ledger_accounts_new SELECT * FROM ledger_accounts;
DROP TABLE ledger_accounts;
ALTER TABLE ledger_accounts_new RENAME TO ledger_accounts;
INSERT INTO ledger_accounts(id,type,wallet_id,currency,created_at)
VALUES('starting-balance-clearing','STARTING_BALANCE',NULL,'EUR',unixepoch('subsec')*1000);
