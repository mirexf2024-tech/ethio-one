# CrissCross Sandbox Integration

This integration is deliberately a provider adapter only. It does not expose a public payout route, debit an ETHIO ONE wallet, create a payout ledger entry, or mark an Earn request as paid.

## Required server environment

Set these only in the private Render API service environment, never in browser code or GitHub:

- `CRISSCROSS_ENABLED=false` (default; keep disabled until sandbox access is approved)
- `CRISSCROSS_API_BASE_URL=https://api.crisscross.money`
- `CRISSCROSS_CLIENT_ID`
- `CRISSCROSS_CLIENT_SECRET`
- `CRISSCROSS_MERCHANT_ID`

Use only sandbox credentials supplied by CrissCross. Confirm with their solutions team whether sandbox uses a separate API base URL before configuring it. Do not copy production credentials into a test environment.

## Implemented adapter

`crisscross.js` provides:
- OAuth access-token retrieval using JSON client credentials.
- In-memory token caching based on `expires_in`.
- HTTPS-only provider requests with request timeouts.
- Ethiopia ETB request validation for Telebirr, M-Pesa Ethiopia, CBE Birr, YaYa and bank transfer payload shapes.
- Single payout initiation and payout status retrieval.
- No automatic retry for payout creation, because a timeout may happen after provider acceptance.

The caller must generate and persist a unique `merchantReference` before initiating a payout. The caller must reconcile the provider result by transaction ID/reference and verified final status.

## Not implemented / not enabled

- No HTTP route calls the provider yet.
- No sandbox credentials are configured.
- No payout balance is available until CrissCross funds the sandbox merchant balance.
- No webhook receiver or signature verification has been implemented.
- No wallet debit, immutable payout ledger, maker-checker approval, or payout reconciliation is connected.
- No production payout is enabled.

## Required release gates

1. Receive written sandbox approval and sandbox credentials from CrissCross.
2. Confirm sandbox base URL and fund the ETB sandbox balance.
3. Test token creation, Ethiopia payout initiation, status retrieval, failures, duplicate references and timeouts.
4. Implement signed webhook verification and idempotent event processing.
5. Connect only to an approved, funded payout request with finance maker-checker controls.
6. Complete legal, KYC/KYT, data-protection, security and operational review before any live payout.

## Official references

- Authentication: https://docs.crisscross.money/authentication
- Ethiopia payouts: https://docs.crisscross.money/payout-market-ethiopia
- Initiate payout: https://docs.crisscross.money/api-reference/payouts/payouts/payouts/initiate-payout
- First sandbox payout: https://docs.crisscross.money/testing-first-payout
