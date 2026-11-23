# Ethio One Service Readiness

This is the working implementation checklist for the 20 services in Ethio One. The production `platform_modules` registry currently contains 19 modules; Ethio Lottery is prepared as the 20th module in branch migration 019 and is not yet applied to production. A visible service tile is not evidence that the service itself is implemented.

## Shared platform foundation

| Area | Current state | Remaining work |
|---|---|---|
| Ethio ID account | Email registration, email OTP, sign-in, refresh sessions and sign-out are wired to the API | Full end-to-end production tests, phone verification, recovery and abuse monitoring |
| User profile | Profile, roles and notifications APIs exist | Complete profile editing, avatar workflow and multilingual validation |
| Identity verification | Ethio ID is generated for accounts | Add a privacy-safe verification request/review workflow; do not treat OTP as identity verification or imply government recognition |
| Subscription foundation | Free, Premium and Pro plan records and subscription/payment tables exist; read-only plans and current-account endpoints exist | Configure entitlements, payment-provider verification, subscription lifecycle and UI; Premium/Pro remain drafts |
| Service access | Registry lists 19 planned modules in production today; Ethio Lottery becomes the 20th only after migration 019 is explicitly approved and applied | Define explicit module release status and server-side access checks before enabling any service |
| Wallet and payments | Not implemented as a production transaction flow | Select licensed/available provider, implement signed callbacks, reconciliation, refunds and audit trail |

## Service registry

All services below are present in the production registry with status `planned`. No service-specific API router is currently mounted in `server/index.js`.

| # | Service | Module key | Registry status |
|---:|---|---|---|
| 1 | Ethio Social | `social` | Planned |
| 2 | Ethio Tube | `tube` | Planned |
| 3 | Ethio Live | `live` | Planned |
| 4 | Ethio Chat | `chat` | Planned |
| 5 | Ethio Market | `market` | Planned |
| 6 | Ethio News | `news` | Planned |
| 7 | Ethio Learning | `learning` | Planned |
| 8 | Ethio Technology | `technology` | Planned |
| 9 | Ethio Wallet | `wallet` | Planned |
| 10 | Ethio Travel | `travel` | Planned |
| 11 | Ethio Assistant | `assistant` | Planned |
| 12 | Ethio Jobs | `jobs` | Planned |
| 13 | Ethio Access | `access` | Planned |
| 14 | Ethio Studio | `studio` | Planned |
| 15 | Ethio Religio | `religio` | Planned |
| 16 | Ethio Earn | `earn` | Planned |
| 17 | Ethio Email | `email` | Planned |
| 18 | Ethio Sport | `sport` | Planned |
| 19 | Ethio Cafe | `cafe` | Planned |\n| 20 | Ethio Lottery (own raffle) | `lottery` | Planned — branch migration 019 only |

## Ethio Lottery — planned-only controls\n\nThe own-raffle implementation is isolated on the feature branch. Its private planning API is Super Admin-only. The prepared migration creates only approval tracking, private campaign drafts, sandbox simulation records and audit logs. Database CHECK constraints force sales, public visibility, live payments and live draws to remain FALSE. No real ticket, payment, winner or prize-payout workflow is present. Do not apply migration 019 to production or merge/deploy this branch until separately authorised.\n\n## Release order

1. Finish and verify the shared account and Ethio ID foundation.
2. Define the Free/Premium/Pro entitlement matrix without changing current service availability.
3. Implement each service end-to-end: database model, API, authorization, mobile/web experience, localization, moderation/safety where relevant, and automated tests.
4. Implement wallet/payment only after the provider and compliance requirements are confirmed.
5. Enable a module in the production registry only after its backend, client experience, security checks and tests pass.
6. Run full regression tests across website, Android and API before each production release.

## Release rule

Do not change a module from `planned` to `active` merely because its UI tile exists. Do not grant Premium/Pro access from a client-side flag. A paid entitlement must be backed by a provider-verified successful payment and an active subscription.