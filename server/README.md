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
Apply `schema/001_initial.sql` to the dedicated Ethio One database. It seeds the 16 module registry entries only; it does not create demo users or pretend unfinished modules are active.
