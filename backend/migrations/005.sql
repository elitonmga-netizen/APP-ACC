BEGIN IMMEDIATE;
CREATE TABLE offline_receipts (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
PRAGMA user_version = 5;
COMMIT;
