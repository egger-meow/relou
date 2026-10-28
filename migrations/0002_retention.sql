-- Preserve only aggregate historical metrics when an archived round's personal data is purged.
ALTER TABLE rounds ADD COLUMN archived_at TEXT;
ALTER TABLE rounds ADD COLUMN final_submission_count INTEGER;
ALTER TABLE rounds ADD COLUMN final_pair_count INTEGER;
ALTER TABLE rounds ADD COLUMN purged_at TEXT;
