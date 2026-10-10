BEGIN IMMEDIATE;
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  before_data TEXT CHECK(before_data IS NULL OR json_valid(before_data)),
  after_data TEXT CHECK(after_data IS NULL OR json_valid(after_data)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_log_created_at ON audit_log(created_at DESC);
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE users ADD COLUMN technician_id TEXT;
PRAGMA user_version = 2;
COMMIT;
