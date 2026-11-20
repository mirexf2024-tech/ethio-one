# Ethio One API

Node.js API foundation for the Ethio One platform.

## Runtime
- Node.js 22.x (aligned with the Render runtime and CI)
- Express
- PostgreSQL (Neon)
- Render Web Service

## Endpoints
- `GET /healthz` — process health
- `GET /readyz` — database readiness check
- `GET /api/v1/system/status` — API and database connectivity
- `GET /api/v1/modules` — planned service registry (database required)
- `POST /api/v1/auth/register` — create a pending Ethio ID and send one selected-channel OTP
- `POST /api/v1/auth/verify` — verify email or phone and issue a session
- `POST /api/v1/auth/login` — sign in with email, phone, or username
- `POST /api/v1/auth/refresh` — rotate a refresh token
- `POST /api/v1/auth/logout` — revoke the supplied refresh token
- `GET /api/v1/auth/me` — return the authenticated profile

## Environment
- `DATABASE_URL` — Neon PostgreSQL connection string
- `CORS_ORIGINS` — comma-separated allowed browser origins
- `AUTH_ENABLED=true` — explicit feature gate; keep disabled until email sender, SMS provider, secrets, and end-to-end checks are ready
- `AUTH_CHALLENGE_PEPPER` — random secret of at least 32 characters for OTP HMAC digests
- `ACCESS_TOKEN_SECRET` — random secret of at least 32 characters for 15-minute access tokens
- `RESEND_API_KEY` and `RESEND_FROM` — verified Resend sender for email OTP
- `SMSHUB_API_KEY` — approved SMSHub Ethiopia account for SMS OTP
- `PORT` — supplied by Render

Do not commit secrets. Configure them in the hosting provider's environment settings.

## Initial schema
Database migrations are versioned under `schema/` and tracked in `schema_migrations`:
- `001_initial.sql` — creates the platform module registry and seeds 16 planned modules.
- `002_identity_foundation.sql` — creates the user identity table with hashed-password storage.
- `003_identity_hardening.sql` — makes email optional when a phone is supplied, defaults new users to pending verification, and records contact verification timestamps and terms version.\n- `004_auth_challenges_and_sessions.sql` — prepares one-time challenge and rotating refresh-session storage. This migration was applied to the live Ethio One database and verified in the migration ledger.

Migrations 001, 002, and 003 are applied to the live Ethio One database. Migration 003 was applied after explicit approval and verified against the live schema and migration ledger. Migration 004 is also applied and the auth challenge/session tables are present. The migration requires at least one contact method (email or phone).

## Authentication status
Authentication routes are implemented for registration, OTP verification, login, access-token profile lookup, refresh-token rotation, logout, verification resend, and password recovery. They remain disabled unless `AUTH_ENABLED=true`, the database is connected, and signing/challenge secrets are configured. Provider adapters are prepared for Resend email and SMSHub Ethiopia SMS; they require `RESEND_API_KEY`, `RESEND_FROM` (a verified sender), and `SMSHUB_API_KEY` in Render secrets. SMSHub requires provider-account verification/KYC before live API sending. Provider adapter tests use mocked HTTP responses and do not send messages. Authentication security helpers normalize email/E.164 phone numbers, hash passwords with bcryptjs (cost 12), generate cryptographically random OTPs, HMAC OTP digests, and hash opaque refresh tokens. The auth router uses short-lived HMAC-signed access tokens, one-time OTP challenges, refresh-token rotation, and a 15-request/15-minute auth API rate limit. The mobile app is wired to the authentication API. Email OTP is the only enabled mobile registration and recovery channel while SMSHub KYC is pending. The Resend shared testing sender is temporary and must not be used for public production registration; a verified sending domain is required for unrestricted delivery. Configure `AUTH_CHALLENGE_PEPPER` as a high-entropy Render secret before enabling the challenge workflow. Migration 004 is applied to production and the `auth_challenges` and `auth_sessions` tables are present. Never store plaintext passwords or mark an unverified account active.
