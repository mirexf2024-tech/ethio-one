-- Add the two services that complete the Ethio One 18-service registry.
-- Safe to re-run: module_key is unique and existing module records are preserved.

INSERT INTO platform_modules (module_key, display_name, status) VALUES
  ('email', 'Ethio Email', 'planned'),
  ('sport', 'Ethio Sport', 'planned')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('007_complete_18_service_registry')
ON CONFLICT (version) DO NOTHING;
