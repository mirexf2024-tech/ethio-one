# Direct-to-Object-Storage Media Upload Contract

Status: design specification only. This document does not enable R2, create buckets, change credentials, or migrate production media.

## Decision

ETHIO ONE will use direct browser/app-to-object-storage uploads for large media. The API authorizes and verifies uploads; it does not proxy file bytes. PostgreSQL stores media identity and metadata, not binary files.

Use a provider adapter so Cloudinary remains the active provider until an R2 migration is separately tested and approved. Cloudflare R2 is the preferred long-term object store candidate, not yet provisioned or enabled.

## Important correction: do not make a permanent provider URL the identity

The database should not use a third-party URL as the durable media identity. Store:

- `id` / `mediaId`: stable UUID
- `user_id`: owner
- `provider`: `cloudinary` or `r2`
- `storage_key`: stable logical object key
- `provider_asset_id`: provider-native identifier, when applicable
- `resource_type`, `mime_type`, `bytes`, `checksum_sha256`
- `lifecycle_status`: `pending`, `ready`, `quarantined`, `deleted`
- timestamps and optional visibility/access metadata

Do not store signed URLs; they expire. A public CDN URL may be derived for genuinely public media, but it is not the ownership key. Private media must be served through an authorization check and short-lived signed read URL.

## Target upload protocol

### 1. Request an upload intent

Authenticated client sends `POST /api/v1/account/media/sign` with:

```json
{
  "resourceType": "image",
  "mimeType": "image/jpeg",
  "bytes": 524288,
  "fileName": "profile.jpg"
}
```

The API must:
- authenticate the user;
- allowlist MIME/resource types and enforce per-type size limits;
- generate the media UUID and a random, account-scoped storage key server-side;
- create a `pending` media row before issuing an upload capability;
- return a short-lived, single-object upload URL and exact required headers;
- never accept a client-supplied bucket name, owner prefix, or arbitrary object key.

Example response shape (illustrative, not a live endpoint):

```json
{
  "provider": "r2",
  "mediaId": "server-generated-uuid",
  "storageKey": "media/<opaque-random-key>",
  "method": "PUT",
  "uploadUrl": "<short-lived-signed-url>",
  "requiredHeaders": { "Content-Type": "image/jpeg" },
  "expiresInSeconds": 300
}
```

### 2. Upload directly

The client sends the file bytes directly to the returned object-storage URL using the returned method and headers. The API server must not receive or buffer the file body.

R2 bucket CORS must be restricted to the actual ETHIO ONE web/app origins and only the required methods/headers. CORS is not authorization; the signed URL is the limited upload capability.

### 3. Complete and verify

Authenticated client calls `POST /api/v1/account/media/complete` with the `mediaId` and upload receipt metadata.

The API must look up the pending row by both `mediaId` and authenticated `user_id`, then use server-side object-storage credentials to HEAD the exact object. Verify:
- object exists at the stored key;
- actual byte count is within policy and matches expected bounds;
- content type is allowed (do not trust filename or browser MIME alone);
- checksum/ETag semantics are understood for the chosen upload method;
- object key and owner match the pending record.

Only after successful verification should the row transition to `ready`. Failed or abandoned uploads remain pending only for a short cleanup window, then are deleted. Suspicious media may be quarantined pending moderation/scanning.

### 4. Read media

Clients reference media by `mediaId`, not by arbitrary URL or provider public ID. The API checks visibility/ownership and then returns either:
- a stable first-party CDN URL for explicitly public media; or
- a short-lived signed read URL for private media.

Do not expose the R2 bucket or credentials. Do not allow a user to read another user's private object by guessing a key.

## Existing code dependencies that must be migrated

The current implementation is not yet provider-neutral end-to-end. Before enabling R2, update all of these together:

1. `server/foundation/routes.js` currently signs Cloudinary-specific fields and its registration endpoint validates `res.cloudinary.com`, `publicId`, and Cloudinary folder ownership.
2. `social.html` currently posts files to Cloudinary and returns `publicId` plus a permanent `url`.
3. `server/social/routes.js` has `safeMedia` checks for Cloudinary URLs and ownership queries comparing `public_id` plus `secure_url`.
4. Social post attachments, stories, direct-message attachments, and group-message attachments currently pass provider URLs/public IDs through their APIs.
5. `server/schema/012_ethio_social_stories.sql` constrains story media URLs to Cloudinary.
6. The existing `media_assets` base schema has non-null Cloudinary-era `public_id` and `secure_url` fields. A migration must make legacy-only fields optional for new R2 rows while preserving old records and indexes safely.
7. Media rendering/read paths must resolve `mediaId` through an authorized media service rather than trusting client-supplied URLs.

The current PR #14 adds a provider factory and additive metadata columns, but it is only a compatibility foundation. It does not yet implement an R2 adapter, the pending/complete verification protocol, or provider-neutral social media references.

## Safe migration sequence

1. Keep Cloudinary as the active provider and retain all existing objects.
2. Merge and test the provider-neutral identity foundation only after migration 023 passes on an isolated staging database.
3. Add R2 adapter and unit tests without selecting it in production.
4. Add pending-intent and completion-verification API, plus object HEAD checks.
5. Update social/story/message clients and server routes to use `mediaId`; preserve a compatibility reader for legacy Cloudinary records.
6. Replace the Cloudinary-only story constraint with a provider-neutral media reference in an additive migration.
7. Configure an isolated R2 test bucket and restrictive CORS only after explicit approval; test upload, completion, read authorization, size/type rejection, expiry, and cross-account access.
8. Copy existing media only after inventory, checksums, counts, and rollback plan are ready. Do not delete Cloudinary originals during initial cutover.
9. Switch production provider only after staging end-to-end tests and explicit approval. Keep rollback possible.

## Operational and security requirements

- Keep object-storage credentials server-side; never put secret keys in web/mobile code.
- Signed upload URLs should be short-lived, restricted to one generated key and intended operation.
- Apply upload rate limits, size limits, MIME allowlists, ownership checks, and cleanup of abandoned pending objects.
- Avoid public buckets for private account/message media.
- Add malware/content scanning or moderation where the risk and media types require it.
- Log media IDs and outcomes, not signed URLs or secret query parameters.
- Configure lifecycle rules for incomplete multipart uploads and abandoned temporary objects.
- Monitor storage volume, request counts, failed uploads, and egress/CDN costs.
- Test backups for PostgreSQL metadata separately from object-storage durability/versioning.

## Out of scope until separately approved

- Creating or paying for an R2 account/bucket.
- Adding R2 secrets to Render.
- Applying migration 023 or any new migration to production.
- Copying or deleting existing Cloudinary objects.
- Changing the production media provider.
- Enabling public access to private media.
