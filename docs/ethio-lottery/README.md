# Ethio Lottery — Own Raffle (Planned Only)

**Current state:** private planning and sandbox implementation.  
**Public availability:** disabled.  
**Real ticket sales, money collection, draws and prize payouts:** disabled.

This module is being prepared for a possible own-operator raffle model. It is not a licence, legal opinion, approval, or public offer.

## Non-negotiable release gates

1. Obtain written ELS/National Lottery Administration classification and confirmation that the proposed legal entity can apply for and receive the relevant raffle/tombola permit.
2. Complete the applicable company, tax, licensing, reporting and statutory obligations only when the owner decides to proceed.
3. Obtain written transaction-specific approval from CBE, Telebirr and M-PESA for the licensed raffle use case.
4. Complete independent security, draw integrity, prize-fund, audit, KYC/age eligibility, privacy and consumer-protection reviews.
5. Prepare a separately reviewed database migration and release change. The current migration deliberately enforces all live switches as FALSE.

## Implemented in this branch

- Private Super Admin planning console.
- ELS and payment-provider approval tracker, initially not_started.
- Draft raffle campaign management.
- Database-enforced planned-only flags.
- Fake sandbox simulations only; no real payment provider calls.
- Dedicated audit trail.
- OM / AM / EN mobile service-directory entry.
- Automated tests for the release locks.

## Explicitly not implemented / not enabled

- No real ticket purchase or ticket issuance endpoint.
- No live payment collection, payment callback, wallet debit or prize payout.
- No production draw engine, winner selection or public winner announcement.
- No public campaign listing or paid raffle advertising.
- No ELS application submission or provider onboarding.

The live platform's existing Ethio Lottery information tile must remain separate from the private own-raffle planning console until a release is approved.

## Migration

The migration at server/schema/019_ethio_lottery_planned_raffle.sql is prepared but must not be applied to production until reviewed and explicitly approved. It registers lottery as planned and creates only planning, draft, sandbox and audit structures.

## Branch policy

This work is kept on feature/ethio-lottery-planned-raffle. Do not merge to main, deploy the API, deploy the static site, apply the migration, or publish the console unless the owner explicitly requests that release step.
