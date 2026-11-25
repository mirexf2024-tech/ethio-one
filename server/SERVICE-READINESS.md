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
| 1 | Ethio Social | `social` | Feed, posts, comments, follows, stories and community membership APIs exist under the canonical `/communities` API path (with `/groups` retained as a compatibility alias). Social web UI supports creating communities, listing memberships, viewing members, adding members, admin role changes and leaving a community. Social messaging entry points are retired; Ethio Chat backend is not yet implemented. Channel publishing is not yet implemented. | Planned |
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

## Payo Premium checkout implementation note

The Payo integration is implemented on the review branch only. It creates a pending subscription and payment transaction before requesting a hosted checkout URL, verifies the callback HMAC against the exact raw request body, matches the provider order ID, account ID and ETB amount, and activates a paid plan only after an approved callback. The checkout route is feature-flagged and requires a non-zero active ETB plan price. The webhook route is mounted before the JSON parser. Premium transactions do not write to Ethio Earn reward or payout ledgers.

Checkout concurrency is serialized by locking the member account row. A second checkout attempt is rejected while a recent pending order exists; abandoned pending Payo orders are marked failed after 15 minutes (the provider's documented checkout expiry is 10 minutes). This reduces duplicate orders and accidental double charges. It does not replace provider-side reconciliation or sandbox tests.

Release gates still required: run the latest CI after all commits, verify the exact callback/signature contract with Payo sandbox, test approved/rejected/duplicate/mismatched callbacks, confirm plan price and entitlement policy, review the PR, merge only with approval, deploy, verify the webhook endpoint, and only then register the callback URL with Payo. Do not enable PAYO_ENABLED or activate Premium pricing before those gates pass.


## Ethio Social / Ethio Chat boundary

Ethio Social is the public-content and community layer: feed, posts, comments, reactions, sharing, follows, stories and community membership/moderation. Private conversations, group messages and audio/video call signaling belong only to Ethio Chat. The Social API returns HTTP 410 for legacy conversation, call and community-message endpoints and identifies Ethio Chat as the owning service; this is not a working redirect because the Ethio Chat API is not yet implemented. Social UI messaging entry points now show a coming-soon notice instead of opening the retired inbox. The community UI uses the canonical API contract while the existing database tables remain unchanged. Existing stored records are not deleted. Community membership and moderation remain in Social, but community chat is not part of Social. Channel creation/publishing and channel roles are still planned and must be implemented separately before they are shown as available.
