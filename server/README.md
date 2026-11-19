# Ethio One API

Node.js API foundation for the Ethio One platform.

## Runtime
- Node.js 20+
- Express
- PostgreSQL (Neon)
- Render Web Service

## Endpoints
- `GET /healthz` — process health
- `GET /api/v1/system/status` — API and database connectivity

## Environment
- `DATABASE_URL` — Neon PostgreSQL connection string
- `CORS_ORIGINS` — comma-separated allowed browser origins
- `PORT` — supplied by Render

Do not commit secrets. Configure them in the hosting provider's environment settings.

## Initial schema
Database migrations are versioned under `schema/` and tracked in `schema_migrations`:
- `001_initial.sql` — creates the platform module registry and seeds 16 planned modules.
- `002_identity_foundation.sql` — creates the user identity table with hashed-password storage.
- `003_identity_hardening.sql` — makes email optional when a phone is supplied, defaults new users to pending verification, and records contact verification timestamps and terms version.

The live database currently has migrations 001 and 002 applied. Migration 003 has been tested on a temporary Neon branch and is awaiting explicit approval before production application. Never store plaintext passwords or mark an unverified account active.
