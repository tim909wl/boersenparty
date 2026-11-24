# Architecture and contracts

## Trust boundaries

The API process is the only writer. Android provides an identifier, never a balance or approval. React requests a server-side quote, and only the finance service can commit ledger entries. SQLite must remain on local disk on the one active server; never place it on a synchronized folder or network share.

```text
NTAG213 -> Android Tag.id -> React terminal -> authenticated API -> one SQLite database
                                             |-> price versions
                                             |-> wallet + double-entry ledger (one transaction)
```

## Modules

| Module | Owns | Boundary |
|---|---|---|
| Auth | users, roles, terminal-bound JWT, login attempts and lockouts | no financial mutation |
| Import/Identity | normalized UIDs, physical band number, assignment | no balance mutation |
| Wallet | lookup and wallet state | read-only outside finance transaction |
| Finance | idempotency, top-up, purchase, cumulative partial/full refunds, ledger, balance cache | cannot invent prices |
| Market | products, quotes, immutable price versions, modes | cannot debit wallets |
| Operations | health and fail-safe mode | cannot delete journal data |

## Financial invariants

All money is integer EUR cents. A committed operation has two or more entries whose sum is zero. Top-up posts `+wallet / -cash-or-card-clearing`; purchase posts `-wallet / +sales`. Ledger rows cannot be updated or deleted. The wallet balance is a transactionally maintained cache and may never become negative. A repeated idempotency key with the same canonical request replays the stored response; changed content returns a conflict.

Each refund has its own financial operation and approval. The server sums earlier refunds inside the write transaction and rejects any amount above the remaining order value. Omitting `amountCents` refunds the complete remainder. The order changes to `REFUNDED` only when the cumulative remainder reaches zero.

SQLite serializes writers. API handlers use `BEGIN IMMEDIATE`, a five-second busy timeout, WAL mode, and a conditional non-negative update. There is no unsupported offline queue at either bar.

## API summary

| Method and path | Roles | Purpose |
|---|---|---|
| `POST /auth/login` | public | terminal-bound 12-hour session |
| `POST /wallets/lookup` | BAR, TOPUP, PAYMENT_LEAD, ADMIN | UID lookup |
| `GET /products` | public | current complete price version |
| `POST /quotes` | BAR, ADMIN | 30-second server quote |
| `POST /purchases` | BAR, ADMIN | atomic purchase; `Idempotency-Key` required |
| `POST /topups` | TOPUP, PAYMENT_LEAD, ADMIN | atomic top-up; `Idempotency-Key` required |
| `POST /approvals/refunds` | PAYMENT_LEAD, ADMIN | request an idempotent partial or full reversal; optional `amountCents` |
| `POST /approvals/wristband-replacements` | PAYMENT_LEAD, ADMIN | request wallet transfer to an unused band |
| `POST /approvals/normal-mode` | PAYMENT_LEAD, ADMIN | request return from a safe mode to NORMAL |
| `POST /approvals/:id/approve` | PAYMENT_LEAD, ADMIN | second user executes the requested protected action |
| `POST /approvals/:id/reject` | PAYMENT_LEAD, ADMIN | second user rejects with a reason |
| `POST /wristbands/block` | PAYMENT_LEAD, ADMIN | freeze a lost band and wallet |
| `GET/POST /operations/cash-session/*` | TOPUP, PAYMENT_LEAD, ADMIN | open, inspect and reconcile a terminal till |
| `GET /operations/report` | PAYMENT_LEAD, ADMIN, AUDITOR | financial and cash-session summary |
| `POST /operations/signed-reports` | PAYMENT_LEAD, ADMIN | persist and HMAC-sign an immutable report snapshot |
| `GET /operations/signed-reports/:id` | PAYMENT_LEAD, ADMIN, AUDITOR | retrieve snapshot with hash/signature verification |
| `POST /operations/backups` | ADMIN | online backup with SHA-256 verification |
| `GET /operations/backups` | ADMIN, AUDITOR | verified backup register |
| `GET/POST/PATCH /admin/users/*` | ADMIN | list, create and activate/deactivate named operators |
| `POST /admin/users/:id/unlock` | ADMIN | clear a recorded temporary login lock |
| `POST /market/tick` | MARKET_MANAGER, ADMIN | bounded demand price update |
| `POST /operations/mode` | PAYMENT_LEAD, ADMIN | immediate safe downgrade to PRICE_FROZEN / PAYMENT_STOP; NORMAL is rejected here |
| `GET /operations/health` | public LAN | DB, mode and ledger-balance signal |

Every write must run only over the isolated staff LAN. In a hardened deployment, health should be separated into public liveness and authenticated financial diagnostics.

## Price algorithm

Each tick counts quantities in consumed quotes since the active version became effective, compares each product with mean demand, and moves it by 5% of base price up/down/unchanged. Values are clamped to configured min/max. A complete new version is written and activated in one transaction. `PRICE_FROZEN` and `PAYMENT_STOP` reject ticks. This simple policy is deterministic and bounded, but needs event-specific simulation before use.

## RBAC

- `BAR`: lookup, quote, purchase.
- `TOPUP`: lookup and top-up.
- `MARKET_MANAGER`: price tick.
- `PAYMENT_LEAD`: top-up and operating mode.
- `ADMIN`: all operational endpoints.
- `AUDITOR`: reserved for future read-only reports.

The bootstrap CLI creates one admin, after which protected endpoints create named least-privilege operators. Deactivation invalidates existing tokens on their next request. Refunds, band replacement, and return to `NORMAL` require two distinct Payment Lead/Admin accounts and expire after 30 minutes. Downgrading to `PRICE_FROZEN` or `PAYMENT_STOP` remains immediate so an incident can always be contained without waiting.

Five invalid passwords within 15 minutes lock the account for 15 minutes. The guard re-checks active and locked state on every authenticated request, so a previously issued token cannot bypass a later lock or deactivation. Login attempts retain username, terminal, timestamp, result, remote address and user agent. Twenty failed attempts from one recorded address within one minute trigger HTTP 429 across usernames. Configure trusted proxies correctly so the recorded address is the actual terminal, and retain an ingress limit as defense in depth.

Signed reports use a dedicated `REPORT_SIGNING_SECRET`, not the JWT key. The stored signature proves that a snapshot was produced by a holder of that secret; it is not a qualified electronic signature. Protect this secret separately. When `SECONDARY_BACKUP_DIR` points to a mounted external device, every online backup is copied there and the second file must match the primary SHA-256 before replication is recorded.
