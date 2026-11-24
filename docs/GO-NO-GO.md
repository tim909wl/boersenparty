# Real-money go/no-go

Default decision for the repository as delivered: **NO-GO for real money** until every item below is evidenced and signed by the Event Lead, Payment Lead, and Technical Lead.

## Mandatory evidence

- Both real Android devices read representative NTAG213 tags with the same byte order as the 500-row register; a signed APK and spare device are ready.
- A load/concurrency rehearsal at expected peak rate shows no duplicate debit, negative balance, locked database, or UI ambiguity.
- The actual LAN, power supply/UPS, fixed server address, restart, online backup, and restore/reconciliation drill pass at the venue.
- Individual users and least-privilege roles replace bootstrap admin use; TLS or an equally controlled isolated LAN risk acceptance is documented.
- Cash custody, top-up limits, lost-band replacement, remaining-balance refund, four-eyes correction, incident ownership, privacy retention, tax/cash-register treatment, and any German ZAG/payment-services implications have been reviewed by qualified responsible people.
- Card provider integration is either implemented and tested with signed webhook/API confirmation and reconciliation, or card top-ups are disabled. Manual entry of a reference alone is not proof of payment.
- Operators understand that NTAG213 UID is clonable/emulatable and accept the mitigations: low maximum balance/top-up, staff-only LAN, anomaly monitoring, rapid wallet freeze, visual band-number check for suspicious cases, and no high-value use.
- End-to-end device tests must prove that the persisted “Vorgang erneut prüfen” flow resolves a deliberately dropped response without a second debit or credit. Unit tests cover server replay, but the real Android/network path remains unverified.
- Partial/full refunds, unused-band replacement, and return to `NORMAL` use tested two-person approval and are available in the Operations UI. Named user administration, account and per-address login limiting, cash-session reconciliation, HMAC-signed reports, verified backups, and optional second-destination replication also exist. Correct trusted-proxy/ingress configuration, physically confirmed external backup media, independent custody of the signing secret, and the real device/network rehearsal still require implementation or documented replacement controls.

## Non-negotiable stops

Any unexplained balance, unbalanced ledger, two active servers, unverified card credit, unknown restore gap, open guest access to the API, or inability to stop both bars is a no-go. Price animation may be removed; payment integrity may not be relaxed.

## Residual risks

NTAG213 does not provide cryptographic cardholder authentication, so central authorization cannot prove the scanned physical tag is original. SQLite is suitable for this small centralized workload but is not high-availability; safe failure means stopping payments. The included price policy is an entertainment mechanism, not a financial market. This software and its tests do not establish legal, fiscal, PCI, or regulatory compliance.
