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
- `GET /api/v1/auth/me` — return the authenticated identity
- `GET/PATCH /api/v1/account/profile` — read/update the signed-in user's profile
- `GET /api/v1/account/roles` — return the signed-in user's roles
- `GET /api/v1/account/notifications` and `POST /api/v1/account/notifications/:id/read` — private notification inbox
- `GET /api/v1/account/media`, `POST /api/v1/account/media/sign`, `POST /api/v1/account/media` — signed Cloudinary media upload and asset registry
- `GET /api/v1/social/conversations` — private conversation inbox with unread message counts.
- `POST /api/v1/social/conversations` — open or create a one-to-one conversation with an active member.
- `GET /api/v1/social/conversations/:id/messages` — read conversation messages.
- `POST /api/v1/social/conversations/:id/messages` — send a private text message.
- `POST /api/v1/social/conversations/:id/read` — mark incoming messages and their inbox notifications as read.
- `GET /api/v1/social/calls/incoming` — authenticated incoming-call inbox.
- `POST /api/v1/social/conversations/:id/calls` — create an audio/video call and submit its WebRTC offer.
- `GET /api/v1/earn/campaigns` — list published task campaigns for an authenticated member.\n- `GET /api/v1/lottery/overview` — private Super Admin-only raffle planning status, approval tracker and locked release flags.\n- `GET/POST /api/v1/lottery/campaigns` and `PATCH /api/v1/lottery/campaigns/:id` — create/update private raffle drafts only.\n- `GET /api/v1/lottery/sandbox/runs` and `POST /api/v1/lottery/sandbox/run` — synthetic sandbox simulations only; no external provider calls, real tickets, winners or money.
- `GET /api/v1/earn/me/summary` — private approved rewards, pending submissions and task history.
- `POST /api/v1/earn/campaigns/:id/submit` — submit task evidence for review; one submission per member per task.
- `GET /api/v1/earn/admin/campaigns` and `POST /api/v1/earn/admin/campaigns` — admin campaign management.
- `PATCH /api/v1/earn/admin/campaigns/:id/status` — publish, pause or archive a campaign.
- `GET /api/v1/earn/admin/submissions` and `POST /api/v1/earn/admin/submissions/:id/review` — review task evidence and approve or reject submissions.
- `010_ethio_earn_task_marketplace.sql` — additive task, submission and reward-ledger schema. Apply only after reviewing the live migration ledger and confirming the production schema; it is not automatically applied by deploying the API.\n- `019_ethio_lottery_planned_raffle.sql` — private planning, approval tracking, draft campaigns, sandbox and audit schema only. All live lottery flags are database-locked FALSE. Do not apply to production until separately approved.

- `GET /api/v1/social/calls/:id` — read call state and new peer signaling events.
- `POST /api/v1/social/calls/:id/signals` — submit an answer or ICE candidate.
- `PATCH /api/v1/social/calls/:id` — accept, reject, end, or mark a call missed.
- `016_ethio_social_calls.sql` — stores call state and authenticated WebRTC signaling. Media streams are peer-to-peer; only signaling passes through the API. The current browser client uses public STUN servers. A TURN relay provider is still required for reliable calling across restrictive mobile-carrier and NAT networks.

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
- `GMAIL_USER` — Gmail address used by Ethio One to send verification messages
- `GMAIL_APP_PASSWORD` — Google App Password for that Gmail account (never use the normal account password)
- `GMAIL_FROM` — optional sender address; defaults to `GMAIL_USER`
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

Migration `006_telegram_account_linking.sql` adds Telegram chat linking challenges and linked chat storage; it must be applied to the production database before enabling Telegram linking. The Telegram webhook is `POST /api/v1/telegram/webhook`; authenticated users request a one-time link using `POST /api/v1/telegram/link/start` with their Bearer access token. Configure Telegram setWebhook with the API webhook URL and `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`. The webhook accepts only Telegram requests carrying the matching `X-Telegram-Bot-Api-Secret-Token` header. Linking tokens are random, stored only as SHA-256 digests, single-use, and expire after 10 minutes. This release implements account linking only; Telegram OTP delivery and app UI controls are not enabled yet.\n\nMigrations 001–013 are applied to the live Ethio One database. The foundation tables, seven roles, ten permissions, and 18 planned modules were verified on 2026-11-20. Migration 003 was applied after explicit approval and verified against the live schema and migration ledger. Migration 004 is also applied and the auth challenge/session tables are present. Migration 013 adds private one-to-one Ethio Social conversations and messages; conversations are restricted to their two active participants and sending is blocked when either account has blocked the other. The migration requires at least one contact method (email or phone).

## Authentication status
Authentication routes are implemented for registration, OTP verification, login, access-token profile lookup, refresh-token rotation, logout, verification resend, and password recovery. A separate read-only Super Admin API and responsive `admin.html` dashboard are available in the monitoring feature branch. Admin access requires an active account, verified email, a valid access token, `AUTH_ENABLED=true`, and an exact server-side `ADMIN_EMAIL` allowlist match; client-provided roles are never trusted. Security events record only an allowlisted event type, severity, optional user ID, HMAC-hashed IP digest, timestamp, and sanitized diagnostic metadata. The public website reports only fixed runtime event types (window error / unhandled rejection); it does not send error messages, stack traces, form values, or message content. High-severity and critical events can trigger optional Resend email alerts, but only when `SECURITY_ALERTS_ENABLED=true`, `ALERTS_FROM` is a verified custom sender, and the recipient is `ADMIN_EMAIL`; the shared `@resend.dev` sandbox sender is rejected. Passwords, OTP values, access/refresh tokens, raw IP addresses, and private messages are not stored in the audit log. They remain disabled unless `AUTH_ENABLED=true`, the database is connected, and signing/challenge secrets are configured. Email OTP now uses Gmail SMTP through Nodemailer. Add `GMAIL_USER` and a Google App Password as Render secrets before enabling authentication. SMS OTP is intentionally disabled for the initial free launch. The sender must enable Google 2-Step Verification and create an App Password; never store the normal Gmail password in the app or repository. Authentication security helpers normalize email/E.164 phone numbers, hash passwords with bcryptjs (cost 12), generate cryptographically random OTPs, HMAC OTP digests, and hash opaque refresh tokens. The auth router uses short-lived HMAC-signed access tokens, one-time OTP challenges, refresh-token rotation, and a 15-request/15-minute auth API rate limit. The mobile app is wired to the authentication API. The mobile registration and password-recovery screens now let users choose email or SMS OTP. SMS requires `SMSHUB_API_KEY`; email requires the configured Resend sender. Authentication remains feature-gated until Gmail SMTP credentials and end-to-end checks are complete. The Resend shared testing sender is temporary and must not be used for public production registration; a verified sending domain is required for unrestricted delivery. Configure `AUTH_CHALLENGE_PEPPER` as a high-entropy Render secret before enabling the challenge workflow. Migration 004 is applied to production and the `auth_challenges` and `auth_sessions` tables are present. Never store plaintext passwords or mark an unverified account active.

## Super Admin monitoring rollout
- `admin.html` — responsive private dashboard; access token and refresh token are kept in page memory only and are cleared on logout or page close.
- `GET /api/v1/admin/overview` — aggregate user counts, module status counts, security-event totals, and latest events.
- `GET /api/v1/admin/events` — paginated security event history with optional severity filter.
- `GET /api/v1/admin/modules` — service registry status.
- `POST /api/v1/telemetry/client-error` — accepts only fixed web runtime error categories; no stack traces, error text, user content, or browser identifiers are collected.
- `005_security_events.sql` — additive audit-log migration. It was applied to the live Ethio One database after explicit approval on 2026-11-20 and verified in the production schema and migration ledger. Do not re-run it manually.
- `ADMIN_EMAIL` and `AUDIT_LOG_PEPPER` are configured in Render. `ACCESS_TOKEN_SECRET` and `AUTH_CHALLENGE_PEPPER` are not yet confirmed configured; keep `AUTH_ENABLED` disabled until both secrets, a verified admin account, production email delivery, database readiness, and end-to-end authentication are verified. Configure `ALERTS_FROM` and enable `SECURITY_ALERTS_ENABLED` only after a verified custom sender domain is available and delivery is tested.
- The dashboard does not expose private messages, passwords, OTPs, tokens, or raw IP addresses. Administrative write actions and account bans are intentionally not included.

## Ethio Earn rollout
The member UI is served at `/earn.html` and uses the existing short-lived Ethio One access token plus refresh-token rotation. Tasks are created as drafts and must be explicitly published by an authorized administrator. Rewards are credited only after an authorized reviewer approves the submitted evidence. Rejected submissions release the reserved task budget and completion slot. ETB values are stored in minor units.

**Payouts are disabled.** The ledger is an in-app accounting record only; there is no bank, Telebirr, M-Pesa or other withdrawal integration in this release. Do not advertise cash withdrawal or promise earnings until a licensed payout provider, fraud controls, operational funding and legal requirements have been verified. Task campaigns must have a real funded budget and clear, lawful instructions before publication.
