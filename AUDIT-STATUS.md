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
- Neon database connection was successfully queried using the application role. Database: `ethio_one`.
- Database currently reports 16 platform modules, all with status `planned`.
- Live database migration ledger currently shows `001_initial` and `002_identity_foundation`; `003_identity_hardening` has not been applied to the live database.
- Migration `003_identity_hardening` was reviewed and successfully tested on a temporary Neon branch. It allows email-or-phone contact, defaults new accounts to `pending_verification`, and adds email/phone verification timestamps plus a terms version. The live `users` table is empty. A phone-only test insert on the temporary branch confirmed `pending_verification` as the default and a NULL email with the phone retained; the temporary test row was deleted. Production application is awaiting explicit approval.
- Database currently contains 0 user rows. No real account registration has been performed.

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

## Important limitations / blockers

1. **Authentication is not implemented.** The mobile registration and sign-in screens are UI previews only. They must not be described as working registration or login.
2. **Live API endpoint responses have not yet been independently verified.** Render confirms successful startup and deployment, but the available external page fetch could not retrieve the API endpoints during this review. The empty Render request-log query also provided no endpoint response evidence.
3. **The 16 service modules are roadmap records, not functioning services.** All 16 database module statuses remain `planned`.
4. **KYC, OTP delivery, email verification, account recovery, payments, wallets, and service workflows are not yet implemented.**
5. Registration country, region, and city are still free-text fields; verified country/region/city cascading selection is not implemented. Terms are not yet linked to published legal documents or stored as a server-side consent record.
6. A production release or APK build is not approved by this audit. Continue web and code validation first.

## Required next work, in order

1. Apply the reviewed `003_identity_hardening` migration after explicit approval, then verify the live schema and migration ledger.
2. Verify live API responses and database readiness using a reliable direct HTTP test path.
3. Review all mobile screens for localization, accessibility, responsive layout, keyboard behavior, and validation.
4. Design and implement real authentication only after choosing safe OTP/email delivery providers and finalizing privacy/consent behavior.
5. Add automated API route tests and database-backed integration tests.
6. Implement admin controls, audit logging, and role-based authorization before enabling service operations.
7. Implement service modules incrementally, with each module tested end-to-end before changing its status from `planned`.
8. Complete security, privacy, performance, and mobile-device testing before any release decision.

## Release rule

Do not publish a production APK or claim the platform is production-ready until authentication, authorization, privacy/security controls, core workflows, and end-to-end tests are complete.
