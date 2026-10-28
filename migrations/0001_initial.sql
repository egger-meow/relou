PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','OPEN','LOCKED','MATCHED','NOTIFIED','ARCHIVED')),
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  notification_target_at TEXT,
  min_pair_score INTEGER NOT NULL DEFAULT 55 CHECK(min_pair_score BETWEEN 0 AND 100),
  snapshot_hash TEXT,
  send_paused INTEGER NOT NULL DEFAULT 1 CHECK(send_paused IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(opens_at < closes_at)
);
CREATE INDEX IF NOT EXISTS idx_rounds_created ON rounds(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_round ON rounds((1)) WHERE status='OPEN';

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  normalized_email TEXT NOT NULL,
  nickname TEXT NOT NULL,
  school_claimed TEXT NOT NULL CHECK(school_claimed IN ('NYCU','NTHU')),
  gender TEXT NOT NULL,
  contact_kind TEXT NOT NULL CHECK(contact_kind IN ('instagram','submitted_email')),
  contact_value TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  adult_attested INTEGER NOT NULL CHECK(adult_attested = 1),
  share_contact_consent INTEGER NOT NULL CHECK(share_contact_consent = 1),
  privacy_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible' CHECK(status IN ('eligible','excluded','withdrawn')),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(round_id, normalized_email)
);
CREATE INDEX IF NOT EXISTS idx_entries_round_status_time ON entries(round_id,status,submitted_at);
CREATE INDEX IF NOT EXISTS idx_entries_submitted_at ON entries(submitted_at);

CREATE TABLE IF NOT EXISTS match_runs (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL UNIQUE REFERENCES rounds(id) ON DELETE RESTRICT,
  snapshot_hash TEXT NOT NULL,
  plan_digest TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  committed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES match_runs(id) ON DELETE RESTRICT,
  a_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
  b_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 100),
  CHECK(a_id <> b_id),
  UNIQUE(round_id,a_id,b_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);

CREATE TABLE IF NOT EXISTS match_members (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
  PRIMARY KEY(round_id,entry_id)
);
CREATE INDEX IF NOT EXISTS idx_match_members_match ON match_members(match_id);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES match_runs(id) ON DELETE RESTRICT,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK(state IN ('queued','sending','sent','failed','uncertain','suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error_code TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(round_id,entry_id)
);
CREATE INDEX IF NOT EXISTS idx_outbox_round_state ON email_outbox(round_id,state);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  round_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit_events(created_at DESC);
