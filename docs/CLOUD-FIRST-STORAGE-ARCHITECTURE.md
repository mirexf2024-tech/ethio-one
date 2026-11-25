# ETHIO ONE Cloud-First Storage Architecture

**Status:** Proposed architecture decision (documentation only)  
**Decision:** Use managed cloud object storage now. Keep the application storage interface portable so ETHIO ONE can move selected workloads to owned infrastructure when scale and operating capacity justify it.

## 1. Decision and principles

ETHIO ONE will not buy or operate physical storage servers at the current stage. The first implementation should use managed cloud object storage, while keeping PostgreSQL for structured application data and metadata.

The design must:
- Separate file bytes from relational application records.
- Store stable object keys, not provider-specific public URLs, in PostgreSQL.
- Upload large files directly from clients to object storage using short-lived, scoped signed upload URLs.
- Keep buckets private by default; authorize reads through the API and short-lived signed download URLs or a controlled CDN.
- Make storage provider details replaceable behind one server-side adapter.
- Support quotas, file-size/type limits, moderation, deletion, retention and audit events.
- Back up database metadata and irreplaceable objects independently, and test restoration.
- Never claim unlimited storage. Apply per-user, per-service and per-file limits and monitor usage/cost.

## 2. Recommended initial topology

| Workload | Initial responsibility | Recommended component |
|---|---|---|
| Accounts, posts, comments, transactions, permissions | Structured records and relationships | Existing PostgreSQL / Neon |
| Photos, videos, voice notes, documents, avatars | Original binary objects | S3-compatible object storage; Cloudflare R2 is a candidate |
| Thumbnails, previews, transcoded media | Derived, reproducible objects | Object storage, separated by object prefix |
| Media delivery | Cache and deliver frequently requested objects | CDN in front of private-origin access |
| Recovery | Independent copies and restore procedures | Database backups plus object versioning/replication or scheduled independent backup |

Cloudflare R2 is a candidate, not yet a connected or purchased service. Before selection, compare current pricing, regional availability, data residency requirements, egress behavior, API compatibility, lifecycle controls, access logs and recovery options. Do not enable a paid plan or create production buckets without explicit approval.

## 3. Upload and download flow

1. The signed-in client asks the ETHIO ONE API to create an upload intent, specifying service, intended file type and size.
2. The API authenticates the user, checks role, ownership, quota, rate limit and allowed MIME/extension/size rules.
3. The API creates a random, non-guessable object key, records an upload as pending, and returns a short-lived signed upload URL for that exact key and operation.
4. The client uploads bytes directly to object storage. Large video uploads should use multipart/resumable upload when supported.
5. The client notifies the API that upload finished. The API verifies object existence, actual size and checksum, then marks it quarantined/pending scan.
6. Malware/content checks and media processing run asynchronously. Only approved objects become available to other users.
7. For a read, the API checks authorization and returns a short-lived signed download URL or a CDN URL backed by a private origin.

The API must not proxy large media bodies through the web process unless there is a specific security or processing reason. Do not store media as base64 in PostgreSQL.

## 4. Data model guidance

Keep a media/object table in PostgreSQL with fields equivalent to:
- `id` — opaque application identifier.
- `owner_user_id` and `service_key` — ownership and product boundary.
- `provider` and `bucket` — storage location, not a client-controlled value.
- `object_key` — stable provider object key.
- `content_type`, `size_bytes`, `checksum_sha256`.
- `status` — pending, quarantined, available, rejected, deleted.
- `visibility` — private, shared, public (public only when explicitly approved).
- `created_at`, `updated_at`, `deleted_at`, and retention metadata.

Never expose raw bucket credentials or accept arbitrary bucket names, object keys, URLs or ACLs from a client. Use parameterized SQL and enforce ownership checks on every operation.

## 5. Security and abuse controls

- Private buckets and least-privilege server credentials.
- Short expiry and narrowly scoped signed URLs; upload permission must not imply read permission.
- Server-side MIME sniffing and file signature validation; do not trust the filename or client MIME header.
- File size, duration, dimensions, quota and request-rate limits.
- Malware scanning where applicable; quarantine before publication.
- Safe image/video processing in isolated workers with resource limits.
- Encryption in transit and provider-side encryption at rest; protect secrets in the hosting provider's secret manager.
- Audit upload, download, share, moderation, deletion and administrative access without logging signed URLs or file contents.
- Deletion workflow covering original, derivatives, caches and backup-retention policy.
- Signed URL leakage mitigation: short TTL, no analytics/referrer logging of tokenized URLs, and private-by-default access.

## 6. Cost and capacity controls

Track at least:
- Stored bytes by service, user and object class.
- Monthly growth and projected capacity.
- PUT/GET/list operations and CDN requests.
- Egress/transfer and media processing costs.
- Failed uploads, abandoned multipart uploads and orphaned objects.
- Largest users and unusual upload/download patterns.

Use configurable quotas and product limits. Add lifecycle rules for temporary uploads, abandoned multipart sessions and reproducible derivatives. Do not delete user originals automatically without an explicit retention policy and user-facing notice.

## 7. Portability: cloud now, owned servers later

Application code should depend on a small internal storage interface, for example:
- `createUploadIntent(...)`
- `verifyUploadedObject(...)`
- `createReadUrl(...)`
- `deleteObject(...)`
- `copyObject(...)`
- `getObjectMetadata(...)`

Implement the first adapter against an S3-compatible API. Keep provider credentials and bucket configuration server-side. The database stores a provider identifier and stable object key; provider URLs are generated at request time.

When ETHIO ONE later operates owned storage, add another adapter compatible with the same API (for example, an S3-compatible self-hosted object store). Migrate by copying objects, verifying checksums and counts, updating provider/bucket metadata in controlled batches, then switching reads. Keep the old copy until reconciliation and rollback windows pass. Avoid a flag-day migration.

## 8. Phased delivery gates

### Phase 0 — Architecture and inventory (now)
- Inventory every upload/media path in web, mobile and API.
- Identify existing Cloudinary or other external media URLs and ownership rules.
- Define object metadata schema, service quotas, allowed formats and retention rules.
- Compare providers and approve a provider, budget and region.

### Phase 1 — Secure cloud storage foundation
- Add storage adapter and provider configuration.
- Add upload-intent, completion-verification and authorized-read API routes.
- Add private bucket, CORS restricted to approved app origins, lifecycle and logging.
- Add tests for authorization, expiry, quota, file validation, checksum and deletion.
- Start with one low-risk media use case; do not switch all services at once.

### Phase 2 — Production rollout
- Enable for a small cohort or one service after staging tests.
- Monitor cost, error rate, upload completion, latency and abuse signals.
- Add support runbook, backup/recovery test and rollback procedure.
- Migrate existing media only after inventory, ownership mapping and checksum validation.

### Phase 3 — Scale and owned infrastructure assessment
Evaluate owned storage only when measured monthly spend, data volume, traffic, regulatory requirements and an operations team justify it. Include hardware, redundant sites, power, cooling, bandwidth, security, staffing, replacement parts and disaster recovery in the total cost—not only disk price.

## 9. Release blockers / explicit non-claims

This document does not mean object storage is connected, a bucket exists, production media has moved, or backups/restores have been tested. No production environment, database schema, storage provider, billing plan or payment configuration is changed by this proposal.

Do not release production uploads until private access, signed URL authorization, content validation, quotas, monitoring, deletion behavior and a successful restore/recovery exercise have been verified.