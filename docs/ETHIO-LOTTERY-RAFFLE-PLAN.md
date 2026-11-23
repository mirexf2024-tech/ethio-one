# Ethio One — Ethio Lottery (Own Raffle) Delivery Plan

## Product decision
- First product: own digital raffle.
- Product status: planned/private build.
- Public ticket sales: OFF.
- Live payments: OFF.
- Live draws and prize payouts: OFF.
- No paid raffle promotion before written legal approval.
- This module must not alter the other Ethio One services.

## Legal and commercial gates
1. Obtain written ELS/National Lottery Administration classification of the proposed digital raffle.
2. Confirm own-operator licence eligibility, application documents, capital/financial requirements, statutory fees, tax treatment, prize reserve, reporting and audit obligations.
3. Confirm whether online ticketing, QR ticket issuance, random draw technology, electronic results and prize distribution need separate approval.
4. Obtain written provider approvals for CBE, Telebirr and M-PESA specifically covering licensed raffle transactions.
5. Obtain legal review of final campaign rules, user eligibility, privacy, KYC/AML, consumer disclosures, responsible-play controls and complaint handling.
6. Do not enable any live transaction unless all required approvals are current and verified.

## Product surfaces
- Public planned page: `/raffle.html` (OM/AM/EN).
- Planned user areas: Raffle Home, My Tickets, Ticket Details/QR, Results, Winners, Rules, Support and Disputes.
- Planned admin areas: Campaign Builder, Licence Register, Provider Approval Register, Finance/Prize Ledger, Draw Review, Audit Log and Reports.
- Current public page is informational only and links to the official ELS site. Its ticket graphic is explicitly a non-valid preview.

## Architecture
- Frontend: existing static Ethio One web app.
- API: existing Express service; future isolated router under `/api/v1/lottery`.
- Database: existing Neon PostgreSQL; additive migration `020_ethio_lottery_raffle_foundation.sql`.
- Payment integration: provider adapters only after written provider approvals; use provider-hosted checkout or documented APIs, signed callbacks, server-side status verification, idempotency and reconciliation.
- Draw engine: independently reviewed randomisation, committed seed/hash, two-person approval, reproducible audit evidence and result publication only after verification.
- Security: RBAC, least privilege, rate limiting, immutable audit events, no client-trusted payment status, encryption of secrets and PII minimisation.

## Database foundation
The migration creates:
- `raffle_feature_control`: single authoritative kill-switch, defaults to planned and hard-checks all live switches false.
- `raffle_licence_records`: ELS/authority licence register.
- `raffle_provider_approvals`: CBE, Telebirr and M-PESA approval states, seeded as not requested.
- `raffle_campaigns`: draft/planned campaign metadata.
- `raffle_tickets`: future ticket records; only sandbox state is permitted by the current schema.
- `raffle_payment_records`: simulation-only records; environment is constrained to sandbox.
- `raffle_draw_records`: sandbox draw metadata and verification status.
- `raffle_audit_events`: traceable administrative actions.

## Development stages
1. UI and content (OM/AM/EN) — planned page now.
2. Additive schema migration — prepare and test on temporary Neon branch before applying.
3. Private admin tools — licence/provider records, campaign drafts, reports; no public sale.
4. Sandbox-only workflows — simulated checkout callbacks, test tickets and test draw with clearly labelled fake data.
5. Security and independent QA — auth, role checks, replay protection, double-entry financial review, draw reproducibility and access-control tests.
6. Legal and provider sign-off — collect and verify documentary evidence.
7. Controlled production activation — only after explicit owner decision and verified current approvals; default remains OFF.

## Release checklist
- [ ] ELS written classification received.
- [ ] Own raffle licence approved and validity checked.
- [ ] Legal counsel reviewed final operating model and campaign rules.
- [ ] CBE merchant and raffle transaction approval received.
- [ ] Telebirr merchant and raffle transaction approval received.
- [ ] M-PESA merchant and raffle transaction approval received.
- [ ] Tax, statutory commission and prize-fund treatment confirmed in writing.
- [ ] Draw process and independent audit accepted.
- [ ] Refund, settlement, dispute and winner-payment procedures tested.
- [ ] Super Admin explicitly authorises go-live.
- [ ] Feature control reviewed and changed only through a separately approved release.

## Non-goals before approval
No live ticket purchases, real payment intents, prize payouts, public paid-raffle advertising, live draw, or attempts to bypass legal/provider requirements.


## Implemented private workspace (2026-11-23)
- Private Super Admin workspace: `/raffle-admin.html` (OM/AM/EN).
- Linked from the main Super Admin page.
- API routes under `/api/v1/lottery/admin` require the verified Super Admin account matching `ADMIN_EMAIL`.
- Implemented draft campaign creation/editing, licence record entry, payment-provider approval records, sandbox ticket generation, sandbox payment simulation and sandbox draw preview.
- Public `GET /api/v1/lottery/status` remains read-only and always reports all live switches as false.
- Sandbox ticket generation is limited to editable draft campaigns and the signed-in Super Admin account.
- Simulated payments are hard-coded to the database `sandbox` environment and do not contact providers or move money.
- Sandbox draw output is explicitly a preview; it does not declare a real winner or pay a prize.
- The API contains no public ticket purchase, live payment, production draw or prize payout route.
- Existing migration `020_ethio_lottery_raffle_foundation` is applied to the production database. Initial raffle campaign, ticket, payment, draw and audit counts were all zero before sandbox testing.
- Deployment status must be checked after every commit; a Render deployment being queued or in progress is not a live release.
