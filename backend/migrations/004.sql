BEGIN IMMEDIATE;
CREATE TABLE order_photos (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL DEFAULT 'service-orders' CHECK(resource='service-orders'),
  order_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('Antes','Depois')),
  caption TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  FOREIGN KEY(resource,order_id) REFERENCES records(resource,id) ON DELETE CASCADE
);
CREATE INDEX order_photos_order ON order_photos(order_id);
PRAGMA user_version = 4;
COMMIT;
