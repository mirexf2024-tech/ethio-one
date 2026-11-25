# ETHIO ONE — Reliability and Operations

## Purpose

Operate Ethio One as a continuously maintained service, not a one-time website release. Reliability is measured, reviewed and improved continuously. No online service can promise zero downtime; the objective is to detect failures quickly, protect data, recover predictably and communicate honestly.

## Current production topology

- Public web: https://ethio-one.onrender.com
- API: https://ethio-one-api.onrender.com
- API health: `/healthz`
- API readiness (includes database connectivity): `/readyz`
- Database status: `/api/v1/system/status`
- API host currently uses a Render Free service; cold starts and scale-to-zero are possible.
- The production API uses one service instance in the current known configuration. This is not high availability.
- One manual production database snapshot was previously created. A verified restore drill and recurring backup schedule have not been established.
- No user should be told that the whole platform is production-ready: core authentication and service modules still have incomplete release gates.

## Monitoring added in this branch

`.github/workflows/production-uptime.yml` checks the three public API endpoints every 15 minutes and can also be run manually. Each endpoint is retried three times to tolerate cold starts and short network interruptions. A failed run appears in GitHub Actions and can be used as an incident signal.

This monitor is not an independent commercial uptime SLA, does not guarantee that GitHub Actions starts on time, and does not replace external alerting. It does not modify production services or databases.

## Operating rules

1. Keep production changes behind reviewed pull requests and explicit approval.
2. Never deploy a feature solely because its page or API route exists.
3. Keep staging isolated from production data and credentials.
4. Back up before schema changes; verify the backup and periodically rehearse restore to an isolated environment.
5. Monitor API health, database readiness, error rate, latency, failed logins, queue backlogs and payment reconciliation.
6. Keep payment and withdrawal features disabled until provider onboarding, signed callbacks, idempotency, reconciliation, refunds, audit logs and operational ownership are tested.
7. Do not put credentials, OTPs, personal identity documents or bank details in logs.
8. For each release: tests → staging verification → security review → approval → controlled deployment → smoke test → rollback readiness.

## Incident response

- **API health fails:** inspect Render deployment events and logs; check whether the service is sleeping, restarting or failing to start.
- **Health passes but readiness fails:** investigate database availability, connection limits, credentials and recent migrations. Do not repeatedly restart or run migrations blindly.
- **Web works but a service fails:** check that service's API route, authorization, database query and feature flag separately.
- **Data integrity or payment concern:** stop the affected operation, preserve audit evidence, reconcile provider and database records, and do not manually edit balances.
- **Recovery:** restore only from a verified backup into an isolated target first; validate row counts, constraints and application behavior before any production restoration.

## Next reliability gates

- Configure a paid, always-on API plan and multi-instance capacity only after reviewing cost and obtaining approval.
- Establish scheduled encrypted backups and point-in-time recovery appropriate to the database plan.
- Perform a documented restore drill and record recovery time and recovery point.
- Add an external monitoring/alert destination with an accountable on-call contact.
- Add latency/error-rate dashboards and service-specific synthetic tests.
- Add deployment rollback instructions and test them.
- Define service objectives (availability, latency, recovery time and acceptable data loss) before public launch.
