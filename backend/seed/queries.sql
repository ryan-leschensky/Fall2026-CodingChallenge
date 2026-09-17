CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  lastname VARCHAR(255) NOT NULL
);

-- Sample rows, only inserted into an empty table so the seed is safe to rerun
INSERT INTO users (name, lastname)
SELECT *
FROM (VALUES ('John', 'Doe'), ('Alice', 'Smith')) AS seed (name, lastname)
WHERE NOT EXISTS (SELECT 1 FROM users);
