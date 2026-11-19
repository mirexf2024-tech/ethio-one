# Ethio One authentication design

Status: design only. No registration or sign-in endpoint is enabled by this document.

## Goals
- One Ethio ID for the platform; default account type is `member`.
- Support both email and SMS as first-class verification and recovery channels.
- Accept a verified email address, an international phone number (E.164), or both.
- Let the user choose which available channel receives a verification code; offer the other channel as a fallback.
- If both contacts are supplied, verify and record each independently. By default, one verified contact method is sufficient to activate the account; the second remains available for additional verification and recovery.
- Keep every new account in `pending_verification` until the required contact ownership check succeeds.
- Never trust client-supplied account roles, verification flags, status, or account type.
- Keep the delivery provider replaceable; do not bind identity records to one SMS/email vendor.

## Proposed API contract
- `POST /api/v1/auth/register` — validate input, hash password with Argon2id, create pending account, issue a short-lived one-time verification challenge for the selected channel.
- `POST /api/v1/auth/verify` — verify a challenge and mark only the matching contact method as verified; activate only when the account's required verification policy is satisfied.
- `POST /api/v1/auth/verification/resend` — issue a fresh challenge for an already registered, unverified contact, subject to strict rate limits.
- `POST /api/v1/auth/login` — verify password and account status, then issue a short-lived access session and rotating refresh credential.
- `POST /api/v1/auth/refresh` — rotate refresh credentials; revoke the token family if reuse is detected.
- `POST /api/v1/auth/logout` — revoke the current refresh-token family/session.
- `POST /api/v1/auth/password/forgot` and `POST /api/v1/auth/password/reset` — generic responses to prevent account enumeration; single-use, short-lived reset challenges delivered through a verified email or phone.
- `GET /api/v1/auth/me` — return the authenticated user's safe profile, never password hashes or challenge data.

These routes must not be exposed until delivery, secret storage, database migrations, and integration tests are ready.

## Data and credential handling
- Store passwords only as Argon2id hashes; bcrypt is the approved fallback. The current security helper uses bcryptjs with cost factor 12 and rejects passwords over bcrypt's 72-byte input limit. Never store plaintext passwords.
- Store OTP/reset challenge digests, never plaintext codes. The security helper creates cryptographically random six-digit codes and HMAC-SHA256 challenge digests using a separately configured `AUTH_CHALLENGE_PEPPER` (minimum 32 characters). Use one-time use, short expiry, attempt limits, and invalidation after success.
- Bind each challenge to one user, one destination, one purpose, and one channel (`email` or `sms`); never accept a code issued for one channel as proof of another.
- Normalize phone numbers to E.164 before uniqueness checks. Normalize email consistently before storage and comparison.
- Do not log passwords, OTPs, authorization headers, refresh tokens, full contact details, or identity documents.
- Keep refresh tokens hashed at rest using SHA-256, rotate on use, and support revocation by session/device. Opaque refresh tokens are generated with a cryptographically secure random generator.
- Keep secrets only in Render secret environment settings; never commit them or expose them to mobile builds.

## Abuse and session protections
- Apply per-IP and per-identity rate limits to register, login, verification, resend, and recovery.
- Add progressive delays/temporary lockouts without enabling easy denial-of-service against a victim.
- Use generic login and recovery errors so responses do not reveal whether an account exists.
- For web clients, prefer Secure, HttpOnly, SameSite cookies and add CSRF protection to state-changing requests.
- For native mobile clients, store refresh credentials in OS-protected secure storage; never AsyncStorage/plain preferences.
- Validate request bodies with strict schemas, size limits, and allowlisted fields.
- Enforce authorization on the server for every protected resource; a UI-hidden button is not access control.

## Verification and account lifecycle
- A verified email does not imply a verified phone, and vice versa; record each timestamp separately.
- If a user supplies both contacts, support verifying either first and the other later; do not silently mark both verified after one OTP.
- Do not set `active` until the configured policy is satisfied.
- Do not accept roles, KYC state, wallet balances, or privileges from registration payloads.
- KYC/Fayda checks are separate workflows and must use approved integrations and explicit consent.
- Keep an audit trail for security-sensitive events without storing secrets or excessive personal data.

## Required tests before enabling routes
- Duplicate email/phone/username and normalization collisions.
- Invalid input, weak passwords, and malformed request bodies.
- Correct/incorrect/expired/replayed OTP and reset challenges for both channels.
- A code issued by SMS cannot verify email, and an email code cannot verify a phone.
- Resend cooldowns, rate limits, provider failures, and anti-enumeration response consistency.
- Pending, active, suspended, and revoked-account behavior.
- Password hash verification; refresh rotation and replay detection.
- Session expiry, logout, CSRF (web), secure-storage integration (mobile).
- Database failure behavior, transaction rollback, and concurrent registration races.

## External provider dependencies still required
- The product decision is set: both email OTP and SMS OTP must be supported.
- Selected adapters: Resend for email and SMSHub for Ethiopian SMS. Resend requires an API key and a verified sender/domain for production delivery. SMSHub's published API documentation states that API sending is unlocked after account identity/KYC approval; confirm the account is approved before attempting live sends.
- Provider adapter modules are in `server/providers/`. Configure `RESEND_API_KEY`, `RESEND_FROM`, `SMSHUB_API_KEY`, and `AUTH_CHALLENGE_PEPPER` only in Render secret environment settings; never place them in source code or mobile builds. Provider adapters and security primitives are tested but are not yet connected to public auth routes.
- Do not send real OTPs or enable account creation until both required delivery paths are configured and end-to-end delivery is verified.
