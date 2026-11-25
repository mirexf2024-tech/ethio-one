# Ethio One Service Readiness

This checklist reflects the current repository and the production `platform_modules` registry. The live registry contains **20 service modules**; every module currently has status `planned`. A visible service tile or a mounted API router does not by itself mean a service is production-ready.

## Shared platform foundation

| Area | Current state | Remaining work |
|---|---|---|
| Ethio ID account | Email registration, email OTP, sign-in, refresh sessions and sign-out are wired to the API | Full end-to-end production tests, phone verification, recovery and abuse monitoring |
| User profile | Profile, roles and notifications APIs exist | Complete profile editing, avatar workflow and multilingual validation |
| Identity verification | Ethio ID is generated for accounts | Add a privacy-safe verification request/review workflow; do not treat OTP as identity verification or imply government recognition |
| Subscription foundation | Free, Premium and Pro plan records and subscription/payment tables exist; read-only plans and current-account endpoints exist | Configure entitlements, payment-provider verification, subscription lifecycle and UI; Premium/Pro remain drafts |
| Service access | Registry contains 20 modules; all are still `planned` | Define explicit module release status and server-side access checks before enabling a service |
| Wallet and payments | Read-only `/api/v1/wallet/summary` bridge and protected read-only `finance.html` dashboard are implemented on the feature branch; production wallet and withdrawal flows remain disabled | Review and test the read-only bridge and finance dashboard; then implement a dedicated immutable wallet ledger, safe withdrawal reservation, provider callbacks, reconciliation, refunds and finance audit controls |

## Service registry

The production registry currently reports all 20 services as `planned`. API router status below is descriptive only; it is not a release approval.

| # | Service | Module key | API / implementation note | Registry status |
|---:|---|---|---|---|
| 1 | Ethio Social | `social` | Social API router mounted; further end-to-end and moderation checks required | Planned |
| 2 | Ethio Tube | `tube` | No dedicated service API router verified | Planned |
| 3 | Ethio Live | `live` | No dedicated service API router verified | Planned |
| 4 | Ethio Chat | `chat` | No dedicated service API router verified | Planned |
| 5 | Ethio Market | `market` | No dedicated service API router verified | Planned |
| 6 | Ethio News | `news` | No dedicated service API router verified | Planned |
| 7 | Ethio Learning | `learning` | No dedicated service API router verified | Planned |
| 8 | Ethio Technology | `technology` | No dedicated service API router verified | Planned |
| 9 | Ethio Wallet | `wallet` | Payment and wallet release not enabled | Planned |
| 10 | Ethio Travel | `travel` | No dedicated service API router verified | Planned |
| 11 | Ethio Assistant | `assistant` | No dedicated service API router verified | Planned |
| 12 | Ethio Jobs | `jobs` | No dedicated service API router verified | Planned |
| 13 | Ethio Access | `access` | No dedicated service API router verified | Planned |
| 14 | Ethio Studio | `studio` | No dedicated service API router verified | Planned |
| 15 | Ethio Religio | `religio` | No dedicated service API router verified | Planned |
| 16 | Ethio Earn | `earn` | Web page and API router exist; task catalog and review/funding flows exist. Live database currently has zero campaigns. Withdrawals remain disabled. | Planned |
| 17 | Ethio Email | `email` | No dedicated service API router verified | Planned |
| 18 | Ethio Sport | `sport` | No dedicated service API router verified | Planned |
| 19 | Ethio Cafe | `cafe` | No dedicated service API router verified | Planned |
| 20 | Ethio Lottery | `lottery` | API router exists; public ticket sales, payments, draws and payouts remain release-locked pending required approvals | Planned |

## Ethio Earn task catalog

Ethio Earn supports these task categories in its database and API contract:

- Data labeling / AI, transcription, translation, surveys and research
- Data entry, content review, QA testing, design and audio/video work
- Local data collection, business listings and map verification
- Product photography and product descriptions
- Social media tasks, document digitization and voice recording
- Customer support, app testing and other approved task types

Only genuine, clearly described work may be published. Tasks must not require workers to pay an unlock fee, provide passwords/OTPs, create fake engagement, leave fabricated reviews, or disclose sensitive identity or financial information as task proof.

Current production database check: Earn campaign count is zero. This means there are no live Ethio Earn tasks to complete at this time; do not create fake/demo campaigns to make the marketplace look populated. Sponsor funding and moderation must both be verified before a campaign is published. The existing 10% platform fee remains disclosed in the sponsor budget calculation. Payouts stay disabled until the payment route, security configuration, reconciliation and operational controls are tested.

External work-platform links are informational only. Their availability, eligibility and payment methods in Ethiopia must not be guaranteed by Ethio One.

## Release order

1. Finish and verify the shared account and Ethio ID foundation.
2. Define the Free/Premium/Pro entitlement matrix without changing current service availability.
3. Implement each service end-to-end: database model, API, authorization, mobile/web experience, localization, moderation/safety where relevant, and automated tests.
4. Implement wallet/payment only after the provider and compliance requirements are confirmed.
5. Enable a module in the production registry only after its backend, client experience, security checks and tests pass.
6. Run full regression tests across website, Android and API before each production release.

## Release rule

Do not change a module from `planned` to `active` merely because its UI tile exists or its API router is mounted. Do not grant Premium/Pro access from a client-side flag. A paid entitlement must be backed by a provider-verified successful payment and an active subscription.


## Ethio Wallet implementation note

The feature branch currently adds a read-only summary endpoint that derives the display balance from existing Earn task and sponsor credit ledgers and subtracts paid and reserved payout amounts. It also adds a Finance Manager/Admin/Super Admin-only dashboard using the existing protected Earn finance summary and payout-list endpoints. It does not persist a duplicate wallet balance and does not enable withdrawal requests or Chapa transfers. The wallet module must remain `planned` until the complete security, provider, legal, operational and regression gates are passed.
