# Payment Integration Release Checklist

This checklist records the current repository findings and the safe implementation order for Payo Premium collections and member earnings withdrawals.

## Current code observations

Inspected on the payout feature branch:
- `server/index.js` mounts the Earn and Wallet routers and installs global `express.json()` before routers. A provider webhook that signs the raw request body must be mounted before JSON parsing or use a verified raw-body strategy.
- `server/earn/routes.js` exposes member payout requests and finance review routes. Requests are currently held for manual finance review; withdrawals remain feature-flagged.
- Payout destination methods are currently limited to `telebirr`, `cbe`, `awash`, and `other`.
- Beneficiary data is stored as one encrypted account string. This does not model mobile operator plus phone number separately from bank code plus account number.
- Payout statuses are currently `pending`, `processing`, `paid`, and `rejected`.
- Finance can mark a request paid after an explicit manual confirmation and reference. This is suitable only for a documented manual-transfer workflow; provider-backed requests must not use this override.
- `server/wallet/routes.js` is a read-only bridge over the existing Earn ledgers. It does not create a second wallet ledger.
- No Payo Premium order, payment webhook, entitlement activation, or refund flow was found in the inspected API routes.

These are repository observations, not claims about live production configuration.

## Phase A — keep existing manual finance workflow safe

- Preserve existing Earn campaigns, submissions, reward credits, payout history and wallet summary.
- Keep the existing manual transfer path clearly identified as manual, with reviewer, transfer reference, timestamp and audit record.
- Do not let a provider-backed payout be marked paid by the manual finance endpoint.
- Never debit a member's balance twice. Use the existing payout request and payout ledger records as the accounting source until a separately reviewed migration is approved.

## Phase B — Payo Premium collection

Before coding the provider adapter, obtain and record Payo's official API contract:
- merchant onboarding and whether an individual account is accepted for this use case;
- create-checkout endpoint, required fields, amount/currency format and expiry;
- server-side payment verification endpoint;
- webhook signature algorithm, header names, raw-body requirements and retry behavior;
- refund/reversal API and settlement schedule;
- fees, limits, support contacts and dispute process.

Then implement:
- server-created Premium orders with immutable member, plan, amount, currency and unique reference;
- server-side checkout creation only; never accept the amount or paid state from the browser;
- signed webhook verification and provider status lookup;
- idempotent event handling and atomic order-paid plus entitlement activation;
- refund/reversal events that revoke or adjust the entitlement correctly;
- receipts and member-visible payment history.

A successful redirect or client-side screenshot is never proof of payment.

## Phase C — Debo Pay member disbursement

Do not start live payout integration until Debo confirms in writing:
- individual/unregistered developer eligibility for API disbursements for a rewards platform;
- exact KYC documents and any business registration requirement;
- whether sandbox credentials are available to an individual;
- how the Debo payout balance is funded and reconciled;
- support for Telebirr, M-Pesa, CBE Birr and bank transfers for this account;
- fees, limits, settlement timing, reversals and failed-transfer handling.

Implementation requirements after approval:
- add structured, encrypted beneficiary data: mobile operator + E.164 phone, or bank code + account number + account holder;
- validate beneficiary ownership and supported rail before submission;
- store a unique provider merchant reference before dispatch;
- add a provider-specific payout state machine and provider transaction ID;
- verify signed webhook events and reconcile with provider status API;
- make event processing idempotent and use database row locks;
- mark provider-backed requests completed only after provider-confirmed final success;
- on definitive failure, release reserved balance once; on unknown status, keep funds reserved until reconciliation;
- never automatically retry a payout-create call after a timeout without checking provider status.

## Phase D — accounting, UI and operations

- Keep Premium sales, refunds, platform revenue, sponsor funding, member rewards and withdrawals as separate accounting categories.
- Premium purchases must never increase member withdrawable earnings.
- Buying Premium must never be required to earn or withdraw.
- Display gross amount, provider fee, any ETHIO ONE fee, net amount, destination, processing estimate and reference before confirmation.
- Provide separate Premium receipts and earnings/withdrawal history.
- Add finance reconciliation views for provider settlement versus internal orders and payouts.
- Add role-based access, immutable audit events, rate limits, velocity limits and beneficiary-data access logging.
- Add alerts for webhook failures, unmatched transactions, long-pending payouts and reconciliation differences.

## Phase E — test and release gates

Required tests:
- valid, invalid, duplicated, delayed and out-of-order Payo webhooks;
- wrong amount, currency, merchant, order reference and expired order;
- payment success followed by refund/reversal;
- two simultaneous withdrawal requests competing for the same balance;
- duplicated Debo webhook and replayed event;
- provider timeout after accepting a payout, followed by status reconciliation;
- definitive payout failure and one-time reservation release;
- unauthorized finance action and self-approval attempt;
- database rollback and audit failure handling;
- regression tests for existing tasks, rewards, wallet summary and manual payout workflow.

Release order:
1. sandbox only, with flags off by default;
2. automated tests and provider contract verification;
3. finance reconciliation dry run;
4. controlled low-value pilot with explicit approval;
5. production enablement only after written provider onboarding approval and successful end-to-end evidence.

## Non-negotiable safeguards

- Never commit provider secrets or beneficiary data.
- Never enable live money movement merely because an API key exists.
- Never merge or deploy a payout implementation before tests and finance review.
- Keep Payo collection and Debo disbursement adapters independent.
- If either provider declines the use case, preserve the provider-neutral accounting design and replace only that adapter.
