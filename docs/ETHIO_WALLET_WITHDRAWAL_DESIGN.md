# Ethio Wallet — Unified Balance and Withdrawal Design

Status: architecture proposal; **not a live money service**.
Scope: consolidate verified, withdrawable earnings from Ethio Earn and future ETHIO ONE services in one user-facing wallet while keeping each source auditable.

## 1. Product decision

Ethio Wallet is the single balance and withdrawal surface for the ETHIO ONE account. Ethio Earn remains the source of task and sponsor-view rewards. Other services may contribute only when their own source ledger records a final, authorized credit.

Do not create a spendable balance by adding arbitrary service counters in the client. The wallet balance must be derived from immutable server-side ledger entries.

### Balance buckets

- **Pending** — task submissions, sponsor views, refunds, or other credits awaiting validation; not withdrawable.
- **Available** — final, verified credits not held or already paid.
- **On hold** — amount reserved for a pending/processing withdrawal, dispute, fraud review, or legal hold.
- **Paid out** — completed withdrawals, recorded against a provider receipt/reference.
- **Reversed** — compensating debit entries for an erroneous or fraudulent credit; never delete or rewrite the original credit.

Show ETB to users, but store integer minor units (cents) and currency on every entry. Never use floating-point arithmetic for money.

## 2. Integration with the existing Ethio Earn implementation

Repository inspection on 2026-11-23 found:

- Ethio Earn has an immutable `earn_ledger` credit created after reviewer approval.
- Sponsor-view rewards are in `earn_sponsor_ad_credits`.
- `earn_payout_requests` and `earn_payout_ledger` already exist, with manual finance review endpoints.
- `GET /api/v1/earn/payouts` calculates earned, reserved and available amounts; the minimum request is ETB 50.
- `POST /api/v1/earn/payouts` is disabled unless `EARN_PAYOUTS_ENABLED=true` and an encryption key is configured.
- The current Earn payout methods are Telebirr, CBE, Awash and other; the payout request stores encrypted destination details.
- The Earn summary currently returns `payoutsEnabled:false`; the production readiness document says there are no live campaigns and wallet/withdrawal flows are not enabled.
- Ethio Wallet is already one of the 20 service registry modules, but its status is `planned`; there is no wallet router mounted in `server/index.js` yet.

Do not delete or bypass the existing Earn ledgers. Migrate to a shared wallet ledger through a controlled, idempotent backfill or a read-through adapter, reconcile totals per user, and retain source references. Do not count the same Earn credit both from its source ledger and the shared ledger.

## 3. Recommended ledger model

Create a shared wallet ledger with append-only entries, for example:

- `wallet_accounts`: one account per user and currency; status and timestamps.
- `wallet_ledger_entries`: account, user, currency, signed amount_minor, entry_type, source_service, source_table, source_id, idempotency_key, status, metadata-safe reference, created_at.
- `wallet_holds`: amount, reason, source withdrawal/dispute, state, expiry/release timestamps.
- `wallet_withdrawal_requests`: user, amount, currency, destination_id, provider, fee, net amount, status, idempotency key, provider reference, review/audit fields.
- `wallet_payout_destinations`: encrypted account/phone details, provider type, masked hint, holder name, verification status, user confirmation timestamp.
- `wallet_provider_events`: provider event ID, signature verification result, payload hash, processing status and timestamps; do not store unnecessary raw sensitive payloads.
- `wallet_reconciliation_runs`: provider statement/batch reference, totals, differences, reviewer and resolution.

Suggested ledger types: `earn_task_reward`, `earn_sponsor_reward`, `service_credit`, `withdrawal_hold`, `withdrawal_release`, `withdrawal_paid`, `refund`, `reversal`, `manual_adjustment`. Every manual adjustment must have a reason, privileged actor and immutable audit event.

Use a unique constraint on `(source_service, source_table, source_id, entry_type)` or an equivalent idempotency key to prevent duplicate credits. Add foreign keys and indexes for account/user/date and withdrawal status. Enforce append-only behavior at the database permission/trigger layer; corrections are new compensating entries.

## 4. Safe withdrawal lifecycle

1. User completes account security checks and adds a destination (Telebirr or supported bank/mobile-money account).
2. Destination ownership is confirmed through a provider-supported verification method or a controlled verification process. Email OTP alone is not proof of payout-account ownership.
3. User enters amount and reviews fee, net amount, destination and processing estimate.
4. Server validates available balance, minimum/maximum limits, account status, risk limits and idempotency key.
5. In one database transaction, lock the wallet account/balance rows, reserve the amount, and create a pending withdrawal request. Concurrent requests must not spend the same balance.
6. Finance reviews exceptions and risk flags. For automated payouts, send only through a contracted, approved provider adapter.
7. Mark as paid only after a verified provider success callback or independently reconciled provider transaction. A submitted API request or admin button is not proof of payment.
8. On definitive failure/rejection, release the hold exactly once. On timeout/unknown provider status, keep it processing and reconcile; never blindly retry a potentially successful transfer.
9. Notify the user and retain a receipt/reference and full status history.

Statuses: `pending`, `reviewing`, `processing`, `paid`, `rejected`, `failed`, `cancelled`, `reconciliation_required`. Define allowed transitions server-side; users cannot mark a request paid or cancel after provider execution.

## 5. Provider and regulatory gate — Ethiopia

The National Bank of Ethiopia's official list identifies licensed payment instrument issuers including Ethio telecom/Telebirr, Safaricom Ethiopia/M-PESA, Kacha and Yaya. It separately lists licensed payment system operators/gateways such as Chapa and Santim Pay. A licence listing does **not** establish that a provider offers ETHIO ONE a payout/disbursement API, that it will onboard this company, or that a particular product is approved for this use.

Before enabling real withdrawals:

- Obtain written commercial onboarding confirmation and the current API/merchant documentation for the selected provider(s), including disbursement/payout support, settlement account, fees, limits, reversals, callback signing, sandbox and production credentials, support SLA and reconciliation files.
- Ask qualified Ethiopian counsel and the National Bank of Ethiopia whether ETHIO ONE's proposed model is merely a software interface arranging payouts through a licensed provider, or whether holding user funds, issuing stored value, maintaining transferable balances, or operating a wallet requires a payment instrument issuer/payment-system licence or other authorization.
- Do not accept user deposits or allow peer-to-peer transfers, cash-in, stored-value top-ups, interest or third-party wallet transfers as part of this first release.
- Keep the wallet as an auditable display/claim ledger for verified earnings until the legal model and provider contracts are confirmed. Prefer funds to remain with the sponsor/contracted licensed provider rather than commingling user funds with ETHIO ONE operating funds.
- Publish clear terms, fee schedule, limits, complaint/dispute process, expected settlement times, privacy notice and account closure/claim handling.
- Complete KYC/AML, sanctions/fraud screening and reporting obligations as confirmed by counsel/provider. Collect only the minimum necessary identity information and protect it under Ethiopia's Personal Data Protection Proclamation No. 1321/2024.
- Obtain security review, penetration testing, incident response, access controls, finance separation of duties, audit logging and periodic reconciliation before production release.

The NBE's ONPS/10/2025 amendment and the payment instrument issuer framework must be reviewed in their current official form before launch. This design is not a legal opinion.

## 6. Provider strategy

Recommended phased approach:

- **Phase A — manual controlled payout pilot:** only after legal review, written provider arrangement and finance controls. Finance staff initiate the transfer in the provider's official portal; a second authorized reviewer verifies the provider receipt/statement before marking the withdrawal paid. No self-approval.
- **Phase B — API disbursement:** implement one provider adapter only after a documented disbursement API, signed webhooks, idempotency and reconciliation are available. Start with one provider; add Telebirr and bank/mobile-money routes only after separate acceptance tests.
- **Phase C — multiple provider routing:** add provider health checks, limits, cost-aware routing and fallback only after operational maturity. Do not automatically retry unknown outcomes across providers.

Do not select a gateway based only on its checkout/payment acceptance capability. Incoming payment APIs are not the same as outgoing disbursement APIs.

## 7. User experience

Create a dedicated `wallet.html` / Wallet screen linked from the ETHIO ONE home and account menu:

- Total available, pending, on hold and paid-out amounts.
- Earnings breakdown by service (Ethio Earn tasks, sponsor rewards, and later approved services).
- Clear activity feed with date, source, amount, status and transaction/reference ID.
- Add/manage payout destination with masked details and a clear verified/unverified state.
- Withdraw CTA disabled with an honest reason until all release gates pass.
- Withdrawal preview: amount, fee, net amount, destination, minimum, daily/monthly limits and expected processing time.
- Request history with traceable statuses, receipt and support/dispute action.
- Afaan Oromoo, Amharic and English across every label, validation, error, email/SMS and notification.
- Accessible mobile-first design, no clipped amounts, clear decimal formatting and confirmation before submission.

Never show pending task rewards as available cash. Never promise a payout date unless the provider SLA supports it.

## 8. Admin and finance controls

Add a dedicated Wallet Finance area, separate from ordinary service moderation:

- Queue filters by status, provider, date, amount and risk flag.
- Masked destination by default; reveal full details only for a specifically authorized finance role, with reason and audit log.
- Maker-checker separation: requester, reviewer and payment confirmer must not be the same person for high-risk/large payouts.
- Daily reconciliation dashboard: ledger liabilities, reserved holds, provider debits, failed/reversed transfers and unexplained differences.
- Per-user velocity limits, minimum/maximum amounts, daily/monthly caps, cooling-off for changed destinations, duplicate-account and suspicious-pattern checks.
- Freeze/unfreeze with reason and escalation; support case/reference tracking.
- Exportable accounting report and immutable audit trail. No delete/edit balance controls.

## 9. API contract proposal

Mount a dedicated router at `/api/v1/wallet`:

- `GET /summary` — balances by bucket and currency.
- `GET /transactions?cursor=...` — paginated ledger/activity feed.
- `GET /earnings-breakdown` — totals grouped by source service.
- `GET /destinations` — masked payout destinations.
- `POST /destinations` — add destination; encrypt sensitive values at rest.
- `POST /destinations/:id/verify` — initiate/confirm provider-supported verification.
- `DELETE /destinations/:id` — disable only if no active withdrawal depends on it.
- `POST /withdrawals/quote` — fee/net/limit preview, no money movement.
- `POST /withdrawals` — create idempotent request and hold.
- `GET /withdrawals` and `GET /withdrawals/:id` — status/history.
- Admin-only review, provider dispatch, callback and reconciliation endpoints under separate authorization.

Use strict request validation, rate limits, CSRF/origin protection where applicable, signed webhook verification, replay protection, no-store cache headers, structured audit events and safe generic errors. Never expose encryption keys, account ciphertext, raw provider secrets or unmasked destinations in ordinary logs.

## 10. Release and test gates

Keep `EARN_PAYOUTS_ENABLED` false and do not set it merely to make the UI active. The existing Earn payout endpoints must be migrated or wrapped so there is one authoritative wallet withdrawal balance and no double-counting.

Before a production switch, test:

- two simultaneous withdrawals against one balance (only one can reserve the same funds);
- duplicate client retries and duplicate provider callbacks;
- provider timeout after successful transfer and reconciliation recovery;
- rejection/failure releases a hold exactly once;
- partial/late settlement, reversal and refund;
- no user can read another user's balance/destination/request;
- finance role boundaries and maker-checker controls;
- source-credit backfill parity and duplicate prevention;
- integer minor-unit calculations, fees and rounding;
- localization, accessibility, mobile layout and notification delivery;
- backup/restore and incident response.

Production release requires provider contract and sandbox evidence, legal/compliance sign-off, security review, reconciled opening balances, operational support readiness and explicit release approval. Until then, show the wallet as a transparent earnings dashboard, not as a live stored-value or payment wallet.

## Official references checked

- National Bank of Ethiopia — licensed Payment Instrument Issuers and Payment System Operators: https://nbe.gov.et/payment-instrument-issuers-system-operators/
- NBE — ONPS/10/2025 amendment: https://nbe.gov.et/wp-content/uploads/2025/05/ONPS102025-Oversight-of-the-Natioanl-Payment-System-Licensing-and-Authorization-of-Payment-Instrument-Issuer-Amendment-Directive.pdf
- NBE — Payment System Directive archive: https://nbe.gov.et/directives/poyment-system/
- Ministry of Justice — Personal Data Protection Proclamation No. 1321/2024: https://justice.gov.et/en/law/personal-data-protection-proclamation/
