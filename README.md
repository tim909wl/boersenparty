# Börsenparty NFC system

Executable modular-monolith MVP for two bars, 500 pre-registered NTAG213 wristbands, hybrid top-ups, and a demand-driven beverage exchange.

## What is implemented

- NestJS/TypeScript API with JWT terminal sessions and role checks.
- SQLite in WAL mode, foreign keys, full synchronous durability, a versioned SQL migration, and Drizzle schema definitions.
- Separate wristband and wallet identities so a blocked/lost band can later be replaced without rewriting financial history.
- Atomic double-entry top-ups and purchases, cached non-negative balances, server-side price quotes, and request-bound idempotency keys.
- Persistent terminal retries: an in-flight purchase/top-up keeps the same request and idempotency key across reloads until the server confirms its result.
- Full-order refunds, lost-band blocking, and transfer to an unused replacement band without losing wallet history.
- Cumulative partial refunds with a server-calculated remaining amount, over-refund prevention, and two-person approval for every installment.
- Hash-chained audit events for top-ups, purchases, refunds, band administration, and system-mode changes.
- Named operator accounts with role assignment, immediate deactivation checks, and protected administration endpoints.
- Persistent login-attempt history and a 15-minute account lock after five password failures, enforced against both new and existing sessions.
- Application-level password-spraying protection: 20 failed logins per remote address and minute trigger HTTP 429.
- Operations UI for creating, activating, deactivating, inspecting and unlocking staff accounts.
- Per-terminal cash sessions: opening float, cash-top-up assignment, closing count, expected cash, and documented differences.
- Protected operational summary covering wallet liability, financial operations, tills, and audit volume.
- Two-person approvals for refunds, replacement-band transfers, and return to `NORMAL`: one Payment Lead/Admin requests, a different account approves or rejects, and only approval executes the action.
- Operations UI for creating and resolving approval requests and producing verified backups without manual API calls.
- Online SQLite backups with fixed server-side destination, SHA-256 record, audit event, and restore integrity test.
- Optional automatic replication to a distinct mounted backup directory with a second SHA-256 verification.
- Immutable financial report snapshots with SHA-256 plus an independent HMAC-SHA256 signature and verification status.
- Cash top-up and a guarded `CARD_VERIFIED` path that requires an external payment reference.
- Price versions and a bounded demand tick (`POST /api/v1/market/tick`); `PRICE_FROZEN` retains the last complete version.
- React/Vite touch UI for POS, cash top-up, public market, and health status.
- Native Android NFC-A reader mode that passes `Tag.id` to React as an uppercase UID.
- All-or-nothing `.xlsx` import with header, format, and duplicate validation.
- Fail-closed `PAYMENT_STOP`, ledger balance health check, RBAC, immutable ledger triggers, tests, and runbook.

This is an operational MVP, not a certified payment product. See [docs/GO-NO-GO.md](docs/GO-NO-GO.md) before any real-money use.

## Quick start

Requirements: Node.js 22+, npm, and Android Studio only when building the NFC terminal.

```sh
cp .env.example .env
npm install
export DATABASE_PATH=./data/boersenparty.db
export JWT_SECRET='replace-with-at-least-32-random-characters'
export BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-strong-password'
npm run db:migrate
npm run db:seed
npm run import:wristbands -- /absolute/path/wristbands.xlsx
npm run dev
```

The API is at `http://localhost:3000/api/v1`, Swagger at `http://localhost:3000/api/docs`, and Vite at `http://localhost:5173`. New databases deliberately start in `PAYMENT_STOP`. After the acceptance checklist, an admin changes the mode with `POST /api/v1/operations/mode` and a written reason.

For all devices on the same private network, build and start the complete single-origin stack:

```sh
npm run lan:up
npm run lan:check
```

Open `http://SERVER-IP/market` on a Smart TV and `https://SERVER-IP/` on staff terminals. Port `8080` remains available as a display fallback. The current test machine is reachable at `http://192.168.2.190/market` and `https://192.168.2.190/`. The API is available only inside the Docker network; Nginx is the sole LAN-facing service. See [docs/NETWORK.md](docs/NETWORK.md) before using another device or changing the router.

Accepted Excel headers are `Armbandnummer` / `Band_Number` and `UID` / `NFC_UID`. UIDs may contain separators but must normalize to a 4-, 7-, or 10-byte hexadecimal value. The production list should contain exactly 500 valid, unique rows; the importer intentionally does not manufacture missing bands.

Seeded terminal IDs:

| Station | ID |
|---|---|
| Bar A | `11111111-1111-4111-8111-111111111111` |
| Bar B | `22222222-2222-4222-8222-222222222222` |
| Central top-up | `33333333-3333-4333-8333-333333333333` |
| Admin | `44444444-4444-4444-8444-444444444444` |

Create individual operator users and least-privilege roles before the event; the seed admin is bootstrap-only.

## Workspace

```text
apps/api       NestJS modules, migration, import CLI, financial tests
apps/web       React touch terminal and public display
apps/android   Native Android NFC UID bridge/WebView shell
packages/contracts shared API types
docs           architecture, runbook, acceptance and risk decisions
```

## Verification

```sh
npm test
npm run build
npm audit --omit=dev
```

The checked-in state passes 23 automated tests, both production builds, a clean production dependency audit, and API/backup/two-person smoke tests. Android source is included but an APK was not built here because no Android SDK/Gradle wrapper is present in this workspace; it must be built and exercised on both actual NFC phones.
