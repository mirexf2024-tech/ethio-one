# Ethio Lottery — System Architecture

## Existing platform fit

- Client: Ethio One web and Expo / React Native mobile application.
- API: Express on Render.
- Database: Neon PostgreSQL.
- Authentication: existing Ethio ID Bearer access token.
- Authorisation: verified Super Admin only for private planning APIs.
- Audit: dedicated lottery_audit_logs table.

## Current planned-only components

1. lottery_control: singleton release controls; all live booleans have database CHECK constraints requiring FALSE.
2. lottery_approvals: ELS, CBE, Telebirr and M-PESA approval status tracker.
3. lottery_raffle_campaigns: private draft/prepared/archived campaign configuration; sales and public visibility are locked FALSE.
4. lottery_sandbox_runs: synthetic simulations with simulation_only=TRUE.
5. lottery_audit_logs: records Super Admin planning and sandbox actions.
6. server/lottery/providers.js: provider capability registry; all providers are disabled and no network calls exist.
7. server/lottery/routes.js: private Super Admin-only planning and sandbox endpoints.

## Future architecture after written approval

A future, separately reviewed phase may add:
- Legal/licence evidence vault and compliance sign-off.
- Production ticket/order ledger with unique ticket IDs and strict idempotency.
- Provider-specific payment adapters and signed webhook verification.
- Reconciliation, refunds, chargeback/dispute tracking and settlement.
- Segregated prize-fund ledger and dual-control payouts.
- Independently verifiable draw process, seed custody, audit evidence and result publication.
- Age/eligibility checks, KYC/AML where legally required, privacy retention and user support.

These production components are intentionally absent from this branch. The current sandbox does not issue tickets, charge money, select winners or pay prizes.
