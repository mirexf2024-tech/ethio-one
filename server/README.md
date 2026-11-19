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

## Environment
- `DATABASE_URL` — Neon PostgreSQL connection string
- `CORS_ORIGINS` — comma-separated allowed browser origins
- `PORT` — supplied by Render

Do not commit secrets. Configure them in the hosting provider's environment settings.

## Initial schema
Database migrations are versioned under `schema/` and tracked in `schema_migrations`:
- `001_initial.sql` — creates the platform module registry and seeds 16 planned modules.
- `002_identity_foundation.sql` — creates the user identity table with hashed-password storage.
- `003_identity_hardening.sql` — makes email optional when a phone is supplied, defaults new users to pending verification, and records contact verification timestamps and terms version.\n- `004_auth_challenges_and_sessions.sql` — prepares one-time challenge and rotating refresh-session storage. This migration is committed but NOT yet applied to production.

Migrations 001, 002, and 003 are applied to the live Ethio One database. Migration 003 was applied after explicit approval and verified against the live schema and migration ledger. The migration requires at least one contact method (email or phone). The live users table currently has zero rows.

## Authentication status
The schema is prepared for a safer verification lifecycle, but real registration and sign-in are not implemented yet. Authentication routes and account creation remain disabled. Provider adapters are prepared for Resend email and SMSHub Ethiopia SMS; they require `RESEND_API_KEY`, `RESEND_FROM` (a verified sender), and `SMSHUB_API_KEY` in Render secrets. SMSHub requires provider-account verification/KYC before live API sending. Provider adapter tests use mocked HTTP responses and do not send messages. The 004 migration is not applied to production yet. Never store plaintext passwords or mark an unverified account active.
