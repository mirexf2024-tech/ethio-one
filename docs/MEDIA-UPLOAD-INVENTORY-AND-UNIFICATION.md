# ETHIO ONE Media Upload Inventory and Unification Plan

**Audit baseline:** `main` branch, inspected 2026-11-26.  
**Current provider found in code:** Cloudinary.  
**Decision:** Do not select or connect a new provider until this inventory is addressed. Keep the existing upload path intact during the audit.

## Executive finding

ETHIO ONE already has one account-level media signing and asset-registration API, but the implementation is not yet provider-neutral. Most web upload experiences share a helper; messaging duplicates the upload logic. The API, social validation and parts of the schema hard-code Cloudinary URLs and identifiers. This means the current provider is centralized only partially, and a future move to R2 or owned S3-compatible storage would require coordinated code and data migration.

## Existing upload paths found

| User experience | Frontend path | API path | Media usage / validation |
|---|---|---|---|
| Profile avatar | `social.html` `uploadOne(file)` then `PATCH /api/v1/account/profile` | `POST /api/v1/account/media/sign`, `POST /api/v1/account/media`, `PATCH /api/v1/account/profile` | Profile route accepts only `res.cloudinary.com` URL and checks ownership against `media_assets`. |
| Social post image/video | `social.html` `uploadOne(file)` | Same account media sign + registration endpoints; `POST /api/v1/social/posts` | `safeMedia` requires Cloudinary URL; post route verifies owner by public ID, URL and resource type. |
| 24-hour story image/video | `social.html` `uploadOne(file)` | Same account media sign + registration endpoints; `POST /api/v1/social/stories` | Story route requires Cloudinary URL and registered asset; migration 012 has a Cloudinary URL CHECK constraint. |
| Direct message attachments | `social.html` `uploadMessageFile(file)` | Same account media sign + registration endpoints; private message route | Duplicates signing/upload/registration logic; API checks media ownership against `media_assets`. |
| Group message attachments | `social.html` `uploadMessageFile(file)` | Same account media sign + registration endpoints; group message route | Same duplicated client upload path and asset ownership checks. |

## Code-level coupling and risks

1. `server/foundation/routes.js` signs Cloudinary uploads using `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; `/media/sign` returns Cloudinary-specific fields.
2. `/media` asset registration accepts `publicId` and `secureUrl`, validates `res.cloudinary.com`, and persists those provider-specific values.
3. `server/social/routes.js` `safeMedia` only accepts Cloudinary URLs. Post, story, direct-message and group-message ownership checks query `media_assets` by Cloudinary public ID, URL and resource type.
4. `server/schema/008_identity_roles_profile_notifications_media.sql` has a provider column, but also makes `public_id` unique and stores `secure_url`; this is not a complete provider-neutral object model.
5. `server/schema/012_ethio_social_stories.sql` enforces `media_url LIKE 'https://res.cloudinary.com/%'`, so switching provider requires a forward-only schema migration and careful preservation of old rows.
6. `social.html` shares `uploadOne()` across posts, stories and profile photos, but `uploadMessageFile()` separately repeats the same sign → direct provider upload → register flow. These should use one common client upload helper.
7. The mobile app code inspected does not currently expose a member-media upload flow; confirm separately before mobile media features are enabled.

## Recommended unified contract

All clients should call one provider-neutral account media API. The browser/mobile app must not construct provider upload URLs or know provider-specific form fields.

Suggested API lifecycle:

1. `POST /api/v1/account/media/upload-intents` — authenticated request with service key, media kind, declared MIME type, size and optional checksum. Server enforces allowed type, size, user/service quota, rate limits and ownership.
2. Response returns a short-lived upload instruction with provider-neutral fields: `uploadId`, `uploadUrl`, `method`, required headers/form fields, expiry and object key reference. Secrets remain server-side; only narrowly scoped temporary upload authorization is returned.
3. Client uploads directly to private object storage using that instruction. Large videos use resumable/multipart upload where supported.
4. `POST /api/v1/account/media/:uploadId/complete` — server checks provider object existence, actual size, MIME/signature and checksum; asset remains quarantined until validation/moderation completes.
5. API returns a stable application `mediaId`, not a provider URL/public ID. Post, story, avatar and message records reference `mediaId`.
6. Read APIs resolve media access after authorization and issue short-lived signed read URLs or controlled CDN URLs. Private message attachments must not become public merely because a user knows the URL.

## Provider adapter boundary

Implement a server-only interface with operations equivalent to:

- `createUploadIntent(...)`
- `headObject(...)` / `verifyObject(...)`
- `createReadUrl(...)`
- `deleteObject(...)`
- `copyObject(...)`

Start with a Cloudinary adapter to preserve current behavior while API consumers migrate to the neutral contract. Add an S3-compatible adapter only after provider selection and sandbox tests. Cloudflare R2 is one candidate, not an approved or connected service. No production credentials or buckets are assumed.

## Data migration strategy

- Add a provider-neutral `media_objects` model keyed by stable application media ID; keep existing `media_assets` as a compatibility source during transition.
- Add nullable `media_id` references to post/story/message attachment records through additive migrations; do not rewrite or delete existing content in the first migration.
- Backfill mappings for existing Cloudinary assets and verify every reference against the owner and stored object metadata.
- Update APIs to read old and new records during a defined compatibility window.
- Move one media category at a time; verify row counts, object counts and checksums before switching reads.
- Retain the old provider objects until rollback and reconciliation windows have passed.
- Only then schedule a separate migration to remove obsolete Cloudinary-only constraints and fields. Never run destructive cleanup as part of initial rollout.

## Release gates

- [ ] Inventory completed for every web and mobile upload entry point.
- [ ] One shared client upload helper replaces duplicated upload code.
- [ ] Provider adapter has unit tests and no provider-specific logic leaks into route handlers.
- [ ] Upload intents are short-lived, scoped to one user/object and protected against replay/oversize uploads.
- [ ] Server verifies real object metadata; it does not trust client-supplied URL, public ID, MIME type or byte count.
- [ ] Asset ownership and authorization tests cover avatars, posts, stories, private messages and group messages.
- [ ] Private-by-default access, signed reads, quota enforcement, abuse controls, deletion and audit are tested.
- [ ] Staging tests and restore/rollback procedure pass before any production data migration.
- [ ] Provider, region, pricing and budget are approved before creating production storage resources.

## Scope and safety

This audit does not change application behavior, database schema, production environment variables, provider configuration, billing, user media or deployment. It intentionally avoids selecting a provider before the current Cloudinary coupling and all consuming routes are understood.