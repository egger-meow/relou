-- SYNTHETIC LOCAL DEMO ONLY. Never apply to production D1.
INSERT INTO rounds(id,slug,title,status,opens_at,closes_at,notification_target_at)
VALUES('synthetic-local','synthetic-local','本機合成示範（非正式活動）','OPEN',
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+8 days'))
ON CONFLICT(id) DO NOTHING;
