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
- `ADMIN_EMAIL` — exact verified email address allowed to access the Super Admin dashboard
- `AUDIT_LOG_PEPPER` — separate random secret of at least 32 characters used to HMAC-hash client IP addresses in security events
- `SECURITY_ALERTS_ENABLED=true` — optional high-severity email alert gate; leave disabled until a verified custom sender is configured
- `ALERTS_FROM` — verified custom Resend sender (the shared `@resend.dev` sandbox sender is deliberately rejected for security alerts)
- `RESEND_API_KEY` and `RESEND_FROM` — verified Resend sender for email OTP
- `SMSHUB_API_KEY` — approved SMSHub Ethiopia account for SMS OTP
- `TELEGRAM_BOT_TOKEN` — Telegram bot token; configure only in Render secrets
- `TELEGRAM_BOT_USERNAME` — bot username without the `@` prefix
- `TELEGRAM_WEBHOOK_SECRET` — random webhook secret (1–256 characters; configure in Render and use as Telegram webhook secret token)
- `PORT` — supplied by Render

Do not commit secrets. Configure them in the hosting provider's environment settings.

## Initial schema
Database migrations are versioned under `schema/` and tracked in `schema_migrations`:
- `001_initial.sql` — creates the platform module registry and seeds the original 16 planned modules.
- `002_identity_foundation.sql` — creates the user identity table with hashed-password storage.
- `003_identity_hardening.sql` — makes email optional when a phone is supplied, defaults new users to pending verification, and records contact verification timestamps and terms version.\n- `004_auth_challenges_and_sessions.sql` — prepares one-time challenge and rotating refresh-session storage. This migration was applied to the live Ethio One database and verified in the migration ledger.

Migration `006_telegram_account_linking.sql` adds Telegram chat linking challenges and linked chat storage; it must be applied to the production database before enabling Telegram linking. The Telegram webhook is `POST /api/v1/telegram/webhook`; authenticated users request a one-time link using `POST /api/v1/telegram/link/start` with their Bearer access token. Configure Telegram setWebhook with the API webhook URL and `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`. The webhook accepts only Telegram requests carrying the matching `X-Telegram-Bot-Api-Secret-Token` header. Linking tokens are random, stored only as SHA-256 digests, single-use, and expire after 10 minutes. This release implements account linking only; Telegram OTP delivery and app UI controls are not enabled yet.\n\nMigrations 001, 002, and 003 are applied to the live Ethio One database. Migration 003 was applied after explicit approval and verified against the live schema and migration ledger. Migration 004 is also applied and the auth challenge/session tables are present. The migration requires at least one contact method (email or phone).

## Authentication status
Authentication routes are implemented for registration, OTP verification, login, access-token profile lookup, refresh-token rotation, logout, verification resend, and password recovery. A separate read-only Super Admin API and responsive `admin.html` dashboard are available in the monitoring feature branch. Admin access requires an active account, verified email, a valid access token, `AUTH_ENABLED=true`, and an exact server-side `ADMIN_EMAIL` allowlist match; client-provided roles are never trusted. Security events record only an allowlisted event type, severity, optional user ID, HMAC-hashed IP digest, timestamp, and sanitized diagnostic metadata. The public website reports only fixed runtime event types (window error / unhandled rejection); it does not send error messages, stack traces, form values, or message content. High-severity and critical events can trigger optional Resend email alerts, but only when `SECURITY_ALERTS_ENABLED=true`, `ALERTS_FROM` is a verified custom sender, and the recipient is `ADMIN_EMAIL`; the shared `@resend.dev` sandbox sender is rejected. Passwords, OTP values, access/refresh tokens, raw IP addresses, and private messages are not stored in the audit log. They remain disabled unless `AUTH_ENABLED=true`, the database is connected, and signing/challenge secrets are configured. Provider adapters are prepared for Resend email and SMSHub Ethiopia SMS; they require `RESEND_API_KEY`, `RESEND_FROM` (a verified sender), and `SMSHUB_API_KEY` in Render secrets. SMSHub KYC is approved for this deployment; add `SMSHUB_API_KEY` to the Render API service environment before live SMS can be sent. The SMS adapter sends only from the server and never exposes the key to mobile clients. Provider adapter tests use mocked HTTP responses and do not send messages. Authentication security helpers normalize email/E.164 phone numbers, hash passwords with bcryptjs (cost 12), generate cryptographically random OTPs, HMAC OTP digests, and hash opaque refresh tokens. The auth router uses short-lived HMAC-signed access tokens, one-time OTP challenges, refresh-token rotation, and a 15-request/15-minute auth API rate limit. The mobile app is wired to the authentication API. The mobile registration and password-recovery screens now let users choose email or SMS OTP. SMS requires `SMSHUB_API_KEY`; email requires the configured Resend sender. Authentication remains feature-gated until production delivery and end-to-end checks are complete. The Resend shared testing sender is temporary and must not be used for public production registration; a verified sending domain is required for unrestricted delivery. Configure `AUTH_CHALLENGE_PEPPER` as a high-entropy Render secret before enabling the challenge workflow. Migration 004 is applied to production and the `auth_challenges` and `auth_sessions` tables are present. Never store plaintext passwords or mark an unverified account active.

## Super Admin monitoring rollout
- `admin.html` — responsive private dashboard; access token and refresh token are kept in page memory only and are cleared on logout or page close.
- `GET /api/v1/admin/overview` — aggregate user counts, module status counts, security-event totals, and latest events.
- `GET /api/v1/admin/events` — paginated security event history with optional severity filter.
- `GET /api/v1/admin/modules` — service registry status.
- `POST /api/v1/telemetry/client-error` — accepts only fixed web runtime error categories; no stack traces, error text, user content, or browser identifiers are collected.
- `005_security_events.sql` — additive audit-log migration. It was applied to the live Ethio One database after explicit approval on 2026-11-20 and verified in the production schema and migration ledger. Do not re-run it manually.
- `ADMIN_EMAIL` and `AUDIT_LOG_PEPPER` are configured in Render. `ACCESS_TOKEN_SECRET` and `AUTH_CHALLENGE_PEPPER` are not yet confirmed configured; keep `AUTH_ENABLED` disabled until both secrets, a verified admin account, production email delivery, database readiness, and end-to-end authentication are verified. Configure `ALERTS_FROM` and enable `SECURITY_ALERTS_ENABLED` only after a verified custom sender domain is available and delivery is tested.
- The dashboard does not expose private messages, passwords, OTPs, tokens, or raw IP addresses. Administrative write actions and account bans are intentionally not included.
