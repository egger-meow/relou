CREATE TABLE feedback (id TEXT PRIMARY KEY, message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 2000), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX feedback_created ON feedback(created_at DESC, id);
