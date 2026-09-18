-- The starter template shipped a sample users (name, lastname) table. Replace it with the
-- account table below; any other existing users table is left untouched.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'lastname'
  ) THEN
    DROP TABLE users;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stored with the casing the user chose, e.g. 'Alice'
  username VARCHAR(30) NOT NULL,
  -- scrypt hash from lib/password.js; the plaintext password is never stored
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_.-]{3,30}$')
);

-- Usernames are unique regardless of case: 'Alice' and 'alice' are the same name.
-- The index also serves the case-insensitive lookups in models/users.js.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (LOWER(username));
