CREATE TABLE IF NOT EXISTS collection_images (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  added_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'url',
  source_id VARCHAR(100),
  image_url VARCHAR(2048) NOT NULL,
  thumbnail_url VARCHAR(2048),
  page_url VARCHAR(2048),
  width INTEGER,
  height INTEGER,
  title VARCHAR(200) NOT NULL DEFAULT '',
  note VARCHAR(2000) NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT collection_images_size_positive CHECK (width > 0 AND height > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_images_collection_image_url_key
  ON collection_images (collection_id, image_url);
