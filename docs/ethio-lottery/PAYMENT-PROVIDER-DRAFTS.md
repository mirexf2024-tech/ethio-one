# Payment Provider Approval Requests — Draft Only

These requests are not sent. No payment integration is active.

Each provider must confirm in writing that its merchant services may be used for the exact licensed raffle activity. General API availability or merchant onboarding does not equal lottery approval.

## Commercial Bank of Ethiopia

Request current merchant/e-commerce collection options, hosted checkout/API documentation, signed server callbacks, payment status verification, reconciliation, settlement, refunds/reversals, B2C prize disbursement capability, fees, limits and sandbox credentials. Ask CBE to confirm in writing whether the intended licensed raffle use case is permitted.

## Telebirr / Ethio telecom

Request merchant onboarding requirements and explicit written compliance approval for transactions related to a duly licensed raffle. Ask for current checkout/API documentation, server callback signing, transaction verification, refunds/reversals, settlement, limits, fees and sandbox access.

## M-PESA Ethiopia / Safaricom

Request merchant onboarding and explicit written compliance approval for the licensed raffle use case. Ask for current C2B collection and B2C disbursement documentation, signed callbacks, transaction status checks, reversals/refunds, settlement, limits, fees and sandbox access.

## Required common technical controls

- Server-to-server payment confirmation; never trust client-side success.
- Signed webhook verification, idempotency keys and duplicate-event protection.
- Reconciliation against provider statements.
- Refund and dispute workflow.
- Segregated prize reserve and dual approval for prize disbursement.
- No payment credentials, API secrets or signing keys in the mobile app or Git repository.

## Current state

CBE, Telebirr, and M-PESA adapters are disabled placeholders. No provider endpoint is called and no live credentials are requested.
