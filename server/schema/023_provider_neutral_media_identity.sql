-- Additive provider-neutral media identity and storage metadata.
-- Existing media IDs remain unchanged; legacy Cloudinary records are backfilled.
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_asset_id VARCHAR(512),
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(160),
  ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ready';

UPDATE media_assets
SET storage_key = 'legacy/' || provider || '/' || id::text,
    provider_asset_id = public_id
WHERE storage_key IS NULL OR provider_asset_id IS NULL;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_lifecycle_status_check
  CHECK (lifecycle_status IN ('pending','ready','quarantined','deleted'));

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_storage_key_uq
  ON media_assets (storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_assets_provider_asset_idx
  ON media_assets (provider, provider_asset_id);

INSERT INTO schema_migrations (version)
VALUES ('023_provider_neutral_media_identity')
ON CONFLICT (version) DO NOTHING;
