DO $$
BEGIN
  CREATE TYPE collection_permission AS ENUM ('view', 'edit', 'own');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  link_access collection_permission,
  share_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT collections_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT collections_link_access_not_own CHECK (link_access <> 'own'),
  CONSTRAINT collections_share_version_positive CHECK (share_version > 0)
);

CREATE INDEX IF NOT EXISTS collections_owner_id_idx ON collections (owner_id);

CREATE TABLE IF NOT EXISTS collection_members (
  collection_id INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission collection_permission NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, user_id),
  CONSTRAINT collection_members_not_own CHECK (permission <> 'own')
);

CREATE INDEX IF NOT EXISTS collection_members_user_id_idx ON collection_members (user_id);
