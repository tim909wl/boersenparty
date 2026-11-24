# Event runbook

## Before event day

1. Put the server, displays, and Android terminals on a dedicated WPA2/WPA3 staff network without guest access. Give the server a fixed LAN address and follow [NETWORK.md](NETWORK.md).
2. Set strong unique secrets, migrate, seed, import the 500-row workbook, and keep the source workbook unchanged as reconciliation evidence.
3. Build a signed Android APK after setting the fixed terminal URL. Verify ten known bands at each phone, including first/last UID byte order against Excel.
4. Replace bootstrap access with named users and appropriate roles. Do not share the admin password at the bars.
5. Test cash flow, rejected card reference, insufficient funds, double tap/retry, expired quote, blocked band, simultaneous requests from both bars, router loss, phone loss, server restart, and power loss.
6. Reconcile: wallet balances equal wallet-account ledger totals; every committed operation sums to zero; cash top-ups match counted test cash.
7. Stop test payments, create a consistent SQLite backup, label it, and record its checksum. Keep `PAYMENT_STOP` until the signed go/no-go.

## Start

1. Start the single designated server and confirm `/operations/health` shows database `ok`, balanced ledger, and `PAYMENT_STOP`.
2. Confirm Bar A, Bar B, central top-up, and public market view reach the correct server.
3. Confirm named operators can log in only with their assigned roles. Demonstrate one lock/unlock cycle with a test account; never perform this test against the only admin account.
4. Each cash-handling terminal opens its own till with the verified physical starting float. Cash top-ups are rejected without this step.
5. Perform one controlled top-up and purchase with test funds. Test both a partial refund and the final remaining refund: one Payment Lead requests each amount and a different account approves it. Reconcile all operations. Never improvise SQL changes.
6. One Payment Lead requests `NORMAL` after the go/no-go decision and a different account approves it. Direct activation is rejected; `PAYMENT_STOP` and `PRICE_FROZEN` remain immediate. Critical money, band, user, till, and mode changes are audit-chained; additionally record the formal authorization externally.

## During operation

- Cash top-up is confirmed only after cash is physically received.
- `CARD_VERIFIED` is used only when the provider has independently confirmed the exact payment and reference. A terminal receipt seen by an operator is not yet an automated integration.
- A red or ambiguous result means no drink handover. The terminal stores the complete pending request and provides “Vorgang erneut prüfen”, which reuses the original idempotency key even after a reload. Do not clear browser storage or start a different operation while this warning is present.
- Freeze the market (`PRICE_FROZEN`) for price-engine/display issues. Payments continue at the last complete prices.
- Use `PAYMENT_STOP` for DB/server/network uncertainty, ledger imbalance, suspected duplicate UID use, or unexplained balances. NFC sales and top-ups stop; use only a separately approved payment method.

## Failures

| Failure | Safe response |
|---|---|
| Price engine/display | `PRICE_FROZEN`; last prices remain authoritative |
| One Android terminal | remove it; use tested spare; other bar may continue |
| Server/API/database/router | `PAYMENT_STOP`; never record offline debits |
| Lost or cloned band suspicion | block/freeze it; preserve evidence; a Payment Lead may transfer the wallet only to an unused, zero-balance band |
| Ledger health false | immediate `PAYMENT_STOP`; export DB copy; no manual SQL repair during service |
| Restore required | stop payments, restore to a separate machine, identify all post-backup confirmations, reconcile, then explicitly authorize one active server |

## Backups

Set `SECONDARY_BACKUP_DIR` to a genuinely separate mounted device. `POST /operations/backups` invokes SQLite's online backup API, records the primary SHA-256, copies to the second destination, and verifies the second hash. Do not copy only the main `.db` file during WAL activity. Test restore before the event. A restored database may omit later confirmed transactions, so restoration is a financial incident, not a routine restart.

## Close

Set `PAYMENT_STOP`. Each terminal counts and closes its cash session; any difference requires a written reason. Reconcile clearing accounts and wallet liabilities, then create a signed report snapshot and record its SHA-256/HMAC outside the server. Investigate every difference, create the final replicated backup, and retain it according to the organizer's privacy/accounting policy. Decide and document how remaining balances are refunded; bulk end-of-event payout is not implemented.
