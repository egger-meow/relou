-- Preserve one round-run ledger, with immutable allocation batches for early/final decisions.
ALTER TABLE rounds ADD COLUMN early_paused INTEGER NOT NULL DEFAULT 0 CHECK(early_paused IN (0,1));
CREATE TABLE allocation_batches (
 id TEXT PRIMARY KEY,
 round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
 phase TEXT NOT NULL CHECK(phase IN ('early','final')),
 snapshot_hash TEXT NOT NULL,
 plan_digest TEXT NOT NULL,
 algorithm_version TEXT NOT NULL,
 metrics_json TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 UNIQUE(round_id,plan_digest)
);
CREATE UNIQUE INDEX idx_final_allocation ON allocation_batches(round_id) WHERE phase='final';
ALTER TABLE matches ADD COLUMN batch_id TEXT REFERENCES allocation_batches(id) ON DELETE RESTRICT;
ALTER TABLE email_outbox ADD COLUMN phase TEXT NOT NULL DEFAULT 'final' CHECK(phase IN ('early','final'));
ALTER TABLE email_outbox ADD COLUMN batch_id TEXT REFERENCES allocation_batches(id) ON DELETE RESTRICT;
CREATE TRIGGER allocation_round_guard BEFORE INSERT ON allocation_batches BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM rounds WHERE id=NEW.round_id AND
  ((NEW.phase='early' AND status='OPEN' AND early_paused=0 AND opens_at<=NEW.observed_at AND closes_at>NEW.observed_at)
   OR (NEW.phase='final' AND status='LOCKED' AND snapshot_hash=NEW.snapshot_hash))
 ) THEN RAISE(ABORT,'allocation round changed') END;
END;
CREATE TRIGGER allocated_member_guard BEFORE INSERT ON match_members BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND round_id=NEW.round_id
  AND status='eligible' AND adult_attested=1 AND share_contact_consent=1)
 THEN RAISE(ABORT,'ineligible allocation member') END;
END;
