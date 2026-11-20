-- Ethio One foundation: public identity, profile, RBAC, notifications and media metadata.
-- Additive and safe to re-run. No user accounts or permissions are auto-elevated.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ethio_id VARCHAR(24);
UPDATE users
SET ethio_id = 'E1-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE ethio_id IS NULL;
ALTER TABLE users ALTER COLUMN ethio_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_ethio_id_uq ON users (ethio_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  country VARCHAR(80) NOT NULL DEFAULT 'Ethiopia',
  region VARCHAR(100),
  city VARCHAR(100),
  bio VARCHAR(280),
  avatar_url TEXT,
  locale VARCHAR(5) NOT NULL DEFAULT 'om' CHECK (locale IN ('om','am','en')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  role_key VARCHAR(40) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS permissions (
  permission_key VARCHAR(80) PRIMARY KEY,
  description VARCHAR(240) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_key VARCHAR(40) NOT NULL REFERENCES roles(role_key) ON DELETE CASCADE,
  permission_key VARCHAR(80) NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key VARCHAR(40) NOT NULL REFERENCES roles(role_key) ON DELETE RESTRICT,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_key)
);

INSERT INTO roles (role_key, display_name, description) VALUES
 ('member','Member','Standard Ethio One account'),
 ('support','Support','Customer support operations'),
 ('content_manager','Content Manager','Manage approved platform content'),
 ('finance_manager','Finance Manager','Manage authorized finance workflows'),
 ('moderator','Moderator','Review reports and moderate content'),
 ('admin','Administrator','Manage platform operations'),
 ('super_admin','Super Administrator','Platform owner controls')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO permissions (permission_key, description) VALUES
 ('profile.read','Read own profile'),('profile.update','Update own profile'),
 ('notifications.read','Read own notifications'),('media.upload','Upload approved media'),
 ('users.read','Read user directory'),('users.manage','Manage user accounts'),
 ('modules.manage','Manage service availability'),('content.moderate','Moderate platform content'),
 ('finance.manage','Manage authorized finance workflows'),('platform.manage','Manage platform settings')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_key, permission_key)
SELECT 'member', permission_key FROM permissions
WHERE permission_key IN ('profile.read','profile.update','notifications.read','media.upload')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'support', permission_key FROM permissions
WHERE permission_key IN ('profile.read','notifications.read','users.read')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'content_manager', permission_key FROM permissions
WHERE permission_key IN ('profile.read','notifications.read','content.moderate')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'finance_manager', permission_key FROM permissions
WHERE permission_key IN ('profile.read','notifications.read','finance.manage')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'moderator', permission_key FROM permissions
WHERE permission_key IN ('profile.read','notifications.read','users.read','content.moderate')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'admin', permission_key FROM permissions
WHERE permission_key IN ('profile.read','profile.update','notifications.read','media.upload','users.read','users.manage','modules.manage','content.moderate','finance.manage')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'super_admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'general',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'cloudinary',
  public_id VARCHAR(255) NOT NULL UNIQUE,
  secure_url TEXT NOT NULL,
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('image','video','raw')),
  bytes BIGINT NOT NULL CHECK (bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_assets_user_created_idx
  ON media_assets (user_id, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('008_identity_roles_profile_notifications_media')
ON CONFLICT (version) DO NOTHING;
