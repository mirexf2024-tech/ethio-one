# Ethio One — Engineering Audit Status

Last reviewed: 2026-11-20  
Scope: Ethio One only. Legacy Ethio Call repositories and databases are out of scope and must remain untouched.

## Confirmed platform state

- Web landing page: deployed on Render at https://ethio-one.onrender.com.
- API: deployed on Render at https://ethio-one-api.onrender.com.
- API startup log confirms the Express server starts and listens on the configured Render port.
- API routes currently present: `/healthz`, `/readyz`, `/api/v1/system/status`, and `/api/v1/modules`.
- API middleware includes Helmet, configured CORS, JSON body size limit, API rate limiting, proxy trust for Render, and sanitized database-pool error handling.
- API CI passed after adding integration tests; the run verified JavaScript syntax and executed `npm test` successfully.
- Mobile CI passed for commit `96aa08e3b5fd024520a1b66a7540e0b3884b41a5`, including Expo dependency compatibility and TypeScript checks.
- Website CI passed for the accessibility checks added in commit `48dc0fb2d0249dd3e893181aaa1099fa2f880e58` and the latest site changes in commit `c441bf457050555f98ce6da0e83f1d6cfbae6756`.
- Mobile app source is separate from the root website. Updating the landing page does not create a native APK.
- Dedicated Neon database: `ethio_one`, separate from all legacy Ethio Call databases.
- Database currently reports 16 platform modules, all with status `planned`.
- Live migration ledger confirms `001_initial`, `002_identity_foundation`, and `003_identity_hardening` are applied.
- Migration 003 was applied to the live Ethio One database after explicit user approval. The temporary migration branch was deleted successfully.
- Live schema verification confirms `users.email` is nullable, `users.status` defaults to `pending_verification`, email/phone verification timestamps and `terms_version` exist, and a check constraint requires at least one contact method (email or phone).
- Live database currently contains 0 user rows. No real account registration has been performed.

## Changes verified in this audit cycle

- Added the Ethio One E1 brand mark and color-coded service icon grid to the website.
- Added mobile password visibility controls for both registration and sign-in, with matching eye / eye-off states.
- Added client-side registration checks for required profile/location fields, at least one contact method, email and phone format, password length, and terms acceptance. Sign-in now labels its identifier as email or phone. These checks are UI validation only and do not create or authenticate accounts.
- Added a country text field to the registration preview and removed a minimum-width constraint that could force the service cards to overflow on narrow phones.
- Added accessible labels to mobile form inputs, language control, and terms checkbox.
- Improved the website's keyboard navigation with a skip link and visible focus, respected reduced-motion preferences, and labelled the brand artwork for assistive technology. Added CI checks for these features.
- Added a working landing-page language switch for Afaan Oromoo, Amharic, and English, including navigation, service descriptions, contact section, footer, title, and page description.
- Added automated API integration tests for health, readiness, database-unconfigured behavior, 404 handling, and CORS rejection; API CI runs these tests.
- Localized the mobile connected-services heading and caption in Afaan Oromoo, Amharic, and English.
- Added API readiness endpoint that performs a database connectivity check.
- Added API CI checks for dependency installation and Node syntax validation.
- Applied and verified production database migration 003 after explicit approval. No user data was modified or created by the migration.

## Important limitations / blockers

1. **Authentication is not implemented.** The mobile registration and sign-in screens are UI previews only. They must not be described as working registration or login.
2. **Live API endpoint responses have not yet been independently verified.** Render confirms successful startup and deployment, but the available external page fetch could not retrieve the API endpoints during this review. The empty Render request-log query also provided no endpoint response evidence.
3. **The 16 service modules are roadmap records, not functioning services.** All 16 database module statuses remain `planned`.
4. **KYC, OTP delivery, email verification, account recovery, payments, wallets, and service workflows are not yet implemented.**
5. Registration country, region, and city are still free-text fields; verified country/region/city cascading selection is not implemented. Terms are not yet linked to published legal documents or stored as a server-side consent record.
6. A production release or APK build is not approved by this audit. Continue web and code validation first.

## Required next work, in order

1. Verify live API responses and database readiness using a reliable direct HTTP test path.
2. Review all mobile screens for localization, accessibility, responsive layout, keyboard behavior, and validation.
3. Design and implement real authentication only after choosing safe OTP/email delivery providers and finalizing privacy/consent behavior.
4. Add automated API route tests and database-backed integration tests.
5. Implement admin controls, audit logging, and role-based authorization before enabling service operations.
6. Implement service modules incrementally, with each module tested end-to-end before changing its status from `planned`.
7. Complete security, privacy, performance, and mobile-device testing before any release decision.

## Release rule

Do not publish a production APK or claim the platform is production-ready until authentication, authorization, privacy/security controls, core workflows, and end-to-end tests are complete.


## Ethio Lottery — own raffle planned-only branch

- Implementation branch: feature/ethio-lottery-planned-raffle.
- The public Ethio Lottery information tile remains unchanged.
- Added a private Super Admin planning console, planning-only API, draft campaign records, approval tracker, sandbox simulations and OM/AM/EN mobile service-directory entry.
- Prepared migration 019 adds the lottery module as planned and database-enforced OFF flags for sales, public visibility, live payments and live draws.
- Migration 019 has NOT been applied to production. No ELS application has been submitted. No CBE, Telebirr or M-PESA integration has been activated.
- No production ticket, payment, draw, winner or prize-payout workflow exists.
- This branch is not merged to main and no Render deployment was requested or performed.
