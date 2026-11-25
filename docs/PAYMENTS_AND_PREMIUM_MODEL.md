# ETHIO ONE Payments, Premium and Member Earnings

## Product decision

ETHIO ONE core access is free. A member is never required to pay merely to register, sign in, browse, or use the core app. Members pay only when they intentionally purchase an explicitly priced optional Premium service or digital feature.

Payment collection and member earnings are separate money flows:

- **Payo (collection candidate):** collect a member's voluntary payment for a Premium purchase. A verified provider callback confirms the payment before the purchased entitlement is activated.
- **Member earnings:** task rewards and other approved earnings are recorded independently in the ETHIO ONE earnings ledger.
- **Debo Pay (payout candidate):** when approved earnings are withdrawable, request a payout to the member's selected supported bank or mobile wallet, but only after Debo confirms that this app/account is eligible for API disbursements.

Neither provider is considered production-approved until its onboarding, KYC, API access, supported rails, fees, settlement and refund behavior are confirmed in writing.

## Required separation

Never treat Premium collections as member earnings or as funds automatically available for withdrawals.

Use distinct accounting categories and reports:
- premium_collection: payment received for a specific order.
- premium_refund: reversal/refund of a Premium order.
- task_reward: earned by a member and approved under task rules.
- sponsor_credit: approved sponsor-funded member reward.
- withdrawal_reservation: temporarily reserves a member's available earnings.
- payout_completed: confirms a provider payout has completed.

A Premium payment must not increase the member's withdrawable balance. A payout must not be funded by assuming Premium collections are available cash. Finance must reconcile provider settlement and reward funding separately.

## Premium purchase flow

1. Server creates an order with a unique order reference, member ID, product/plan ID, ETB amount, currency, expiry and pending status.
2. Client opens Payo checkout using server-generated order data. Never trust a client-submitted amount or success screen.
3. Payo webhook is verified using the provider's documented signature mechanism and raw request body.
4. Process callbacks idempotently using the provider event/payment ID and unique order reference.
5. Verify amount, currency, merchant account, order reference and final successful provider status.
6. In one database transaction, mark the order paid and grant the exact Premium entitlement once.
7. Handle delayed, duplicate, failed, expired and refunded payments. Do not activate Premium from a browser redirect alone.

## Member withdrawal flow

1. Member requests withdrawal from the available, approved earnings balance.
2. Server validates identity, account ownership, minimum/maximum amount, fees, limits, risk checks and available balance.
3. Reserve the amount atomically so concurrent requests cannot spend the same balance.
4. Finance/admin review is required according to configurable risk thresholds; all overrides are audited.
5. Before enabling Debo, obtain written confirmation that an individual/unregistered developer account may use the payout API for this rewards use case, what KYC documents are required, how the provider balance is funded, and which Ethiopian bank/mobile-wallet rails are available.
6. Persist a unique merchant reference before sending a payout. Never blindly retry a payout-create request after a timeout; query provider status first to avoid duplicate disbursements.
7. Mark a withdrawal paid only after a verified provider status says final success. A client response, admin button, or unverified webhook is not proof of payment.
8. On definitive failure, release the reservation exactly once. For pending/unknown status, keep it reserved and reconcile before changing it.
9. Verify signed webhooks, deduplicate event IDs, validate amount/currency/beneficiary/reference, and use transaction locks for state transitions.

## Recommended statuses

Premium order: pending, paid, failed, expired, refunded, partially_refunded.

Withdrawal: pending_review, approved, processing, completed, failed, rejected, cancelled, unknown_reconciliation.

Only server-side verified provider events/status checks can move provider-backed transactions into final states.

## Finance and member transparency

- Show Premium receipts and refunds separately from task earnings and withdrawals.
- Show member earnings as: pending, approved, reserved, paid, and available.
- Display provider fees, ETHIO ONE fees (if any), net payout, destination, reference and timestamps before the member confirms.
- Make minimum withdrawal, processing window, limits and supported payout rails visible before a request.
- Send in-app notifications for order and withdrawal state changes.
- Provide a downloadable transaction history and a finance reconciliation report.
- Maintain immutable audit records for finance actions and changes to provider configuration.

## Security and release gates

- Keep all provider credentials server-side; never put secrets in browser code, GitHub, logs or chat.
- Verify webhook signatures and enforce idempotency on every financial event.
- Encrypt beneficiary details at rest; restrict access by role and log sensitive-data access.
- Apply rate limits, account-age/risk checks, duplicate-account detection and withdrawal velocity limits.
- Never enable real-money collection or payout until provider onboarding, applicable compliance, refund/dispute handling, settlement funding and operational support are confirmed.
- Start with provider sandbox tests, then a controlled low-value pilot with reconciliation. Feature flags remain off until the full test matrix passes.
- Keep Payo and Debo adapters independent so one provider can be replaced without changing wallet accounting or Premium entitlements.

## Explicit non-goals

- No mandatory app access fee.
- No requirement to buy Premium to earn or withdraw task rewards.
- No automatic conversion of Premium revenue into member rewards.
- No promise that an individual Debo wallet can access commercial API payouts until Debo confirms it.
- No production payout dispatch or provider feature flag activation as part of this design document.
