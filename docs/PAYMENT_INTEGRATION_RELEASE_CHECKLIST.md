# Payment Integration Release Checklist

This checklist records repository findings and verified public provider documentation for Payo Premium collections and Debo Pay member withdrawals.

## Current code observations

Inspected on the payout feature branch:
- `server/index.js` mounts the Earn and Wallet routers and installs global `express.json()` before routers. Payo and Debo webhooks require raw-body signature verification, so their routes must be mounted before JSON parsing or use a verified raw-body strategy.
- `server/earn/routes.js` exposes member payout requests and finance review routes. Requests are currently held for manual finance review; withdrawals remain feature-flagged.
- Payout destination methods are currently limited to `telebirr`, `cbe`, `awash`, and `other`.
- Beneficiary data is stored as one encrypted account string. This does not model mobile operator plus phone number separately from bank code plus account number.
- Payout statuses are currently `pending`, `processing`, `paid`, and `rejected`.
- Finance can mark a request paid after an explicit manual confirmation and reference. This is suitable only for a documented manual-transfer workflow; provider-backed requests must not use this override.
- `server/wallet/routes.js` is a read-only bridge over existing Earn ledgers. It does not create a second wallet ledger.
- No Payo Premium order, payment webhook, entitlement activation, or refund flow was found in the inspected API routes.

These are repository observations, not claims about live production configuration.

## Verified provider documentation — 24 November 2026

### Payo

Payo's public site describes a receipt-based collection flow, not a direct wallet push/USSD checkout:
- Create an order using `POST https://api.pygate.et/v1/orders` with amount, description and callback URL.
- The customer pays by bank/wallet transfer and uploads a receipt; Payo verifies it using OCR and, where necessary, human review.
- The payment webhook uses HMAC-SHA256 in `x-pygate-signature`; the webhook is retried with backoff for up to 24 hours.
- Unpaid orders expire after 10 minutes.
- Payo states its current beta is free and says a business license is not required to sign up.
- Settlement goes directly to the merchant's own bank account; Payo does not hold the money.
- Supported channels listed include CBE, Telebirr and Abyssinia, with additional rails described on the site.

Important product implication: Payo can be used as an optional Premium payment-confirmation service, but the customer journey is transfer + receipt upload. The member must be shown clear instructions and a pending-review state. Do not describe this as an instant card-style checkout.

Public reference: https://payment.et/

Before launch, confirm the exact request/response schema, webhook raw-body signature construction, order lookup/status endpoint, refund/reversal behavior, settlement and support with Payo. The public landing page gives an overview, not a complete formal API contract.

### Debo Pay

Debo's public API reference currently documents:
- API base URL `https://www.debopay.com/v1`.
- Sandbox keys from Dashboard → API Keys and simulated test transactions.
- `POST /v1/payouts` for transfers from Debo balance to an Ethiopian bank or wallet.
- `POST /v1/transfers/bulk` for batches of up to 100 payouts.
- Payout webhooks such as `payout.paid`, signed with HMAC-SHA256 over timestamp plus raw body.
- The public docs list Telebirr, M-PESA, CBE Birr and other Ethiopian rails.

The registration page distinguishes Individual DeboWallet (personal payments, bills and transfers) from Business accounts (merchant acceptance, settlement and supplier payments). The Terms say KYC may be required. The public pages do not confirm that an Individual DeboWallet can obtain merchant API credentials or run reward-platform disbursements.

Public references:
- https://www.debopay.com/docs
- https://www.debopay.com/register
- https://www.debopay.com/terms

Therefore Debo is a technically documented payout candidate, not yet an approved no-business-license production provider for ETHIO ONE.

## Phase A — keep existing manual finance workflow safe

- Preserve existing Earn campaigns, submissions, reward credits, payout history and wallet summary.
- Keep the existing manual transfer path clearly identified as manual, with reviewer, transfer reference, timestamp and audit record.
- Do not let a provider-backed payout be marked paid by the manual finance endpoint.
- Never debit a member's balance twice. Use the existing payout request and payout ledger records as the accounting source until a separately reviewed migration is approved.

## Phase B — Payo Premium collection

Implement only after the complete API contract and merchant setup are confirmed:
- server-created Premium orders with immutable member, plan, amount, currency and unique reference;
- create Payo order from the server; never accept amount or paid state from the browser;
- show the transfer instructions and receipt-upload flow accurately;
- keep the order pending until a valid signed webhook confirms approval;
- verify raw-body HMAC, amount, currency, merchant/project and order reference;
- process duplicate/retried events idempotently;
- atomically mark the order paid and grant exactly the purchased entitlement once;
- handle expired, rejected, delayed and refunded orders;
- provide receipts and member-visible payment history.

A successful redirect, uploaded receipt, or client-side screenshot is never proof of payment. Only verified provider confirmation can activate Premium.

## Phase C — Debo Pay member disbursement

Before live payout integration, obtain written confirmation from Debo:
- whether an individual/unregistered developer can obtain API payout access for a rewards platform;
- exact KYC documents and whether business registration is required;
- whether sandbox API keys can be issued to an individual account;
- how the Debo payout balance is funded and reconciled;
- supported payout rails for the approved account;
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
- payment approval followed by refund/reversal;
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
