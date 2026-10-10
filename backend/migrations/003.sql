BEGIN IMMEDIATE;
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX password_reset_expiry ON password_reset_tokens(expires_at);
PRAGMA user_version = 3;
COMMIT;
