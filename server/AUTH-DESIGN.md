# Ethio One authentication design

Status: design only. No registration or sign-in endpoint is enabled by this document.

## Goals
- One Ethio ID for the platform; default account type is `member`.
- Accept a verified email address or international phone number (E.164).
- Keep every new account in `pending_verification` until ownership is proven.
- Never trust client-supplied account roles, verification flags, status, or account type.
- Keep the delivery provider replaceable; do not bind identity records to one SMS/email vendor.

## Proposed API contract
- `POST /api/v1/auth/register` — validate input, hash password with Argon2id, create pending account, issue a short-lived one-time verification challenge.
- `POST /api/v1/auth/verify` — verify a challenge and mark only the matching contact method as verified; activate only when the account's required verification policy is satisfied.
- `POST /api/v1/auth/login` — verify password and account status, then issue a short-lived access session and rotating refresh credential.
- `POST /api/v1/auth/refresh` — rotate refresh credentials; revoke the token family if reuse is detected.
- `POST /api/v1/auth/logout` — revoke the current refresh-token family/session.
- `POST /api/v1/auth/password/forgot` and `POST /api/v1/auth/password/reset` — generic responses to prevent account enumeration; single-use, short-lived reset challenges.
- `GET /api/v1/auth/me` — return the authenticated user's safe profile, never password hashes or challenge data.

These routes must not be exposed until delivery, secret storage, database migrations, and integration tests are ready.

## Data and credential handling
- Store passwords only as Argon2id hashes (bcrypt is an acceptable fallback if Argon2id is unavailable).
- Store OTP/reset challenge digests, never plaintext codes. Use a cryptographically secure random generator, one-time use, short expiry, attempt limits, and invalidation after success.
- Normalize phone numbers to E.164 before uniqueness checks. Normalize email consistently before storage and comparison.
- Do not log passwords, OTPs, authorization headers, refresh tokens, full contact details, or identity documents.
- Keep refresh tokens hashed at rest, rotate on use, and support revocation by session/device.
- Keep secrets only in Render secret environment settings; never commit them or expose them to mobile builds.

## Abuse and session protections
- Apply per-IP and per-identity rate limits to register, login, verification, and recovery.
- Add progressive delays/temporary lockouts without enabling easy denial-of-service against a victim.
- Use generic login and recovery errors so responses do not reveal whether an account exists.
- For web clients, prefer Secure, HttpOnly, SameSite cookies and add CSRF protection to state-changing requests.
- For native mobile clients, store refresh credentials in OS-protected secure storage; never AsyncStorage/plain preferences.
- Validate request bodies with strict schemas, size limits, and allowlisted fields.
- Enforce authorization on the server for every protected resource; a UI-hidden button is not access control.

## Verification and account lifecycle
- A verified email does not imply a verified phone, and vice versa; record each timestamp separately.
- Do not set `active` until the configured policy is satisfied.
- Do not accept roles, KYC state, wallet balances, or privileges from registration payloads.
- KYC/Fayda checks are separate workflows and must use approved integrations and explicit consent.
- Keep an audit trail for security-sensitive events without storing secrets or excessive personal data.

## Required tests before enabling routes
- Duplicate email/phone/username and normalization collisions.
- Invalid input, weak passwords, and malformed request bodies.
- Correct/incorrect/expired/replayed OTP and reset challenges.
- Rate limits and anti-enumeration response consistency.
- Pending, active, suspended, and revoked-account behavior.
- Password hash verification; refresh rotation and replay detection.
- Session expiry, logout, CSRF (web), secure-storage integration (mobile).
- Database failure behavior, transaction rollback, and concurrent registration races.

## External dependency decision still required
Choose an email and/or SMS OTP delivery provider before implementation. Keep provider credentials in Render secrets. Do not send real OTPs or enable account creation until the provider is configured and end-to-end delivery is verified.
