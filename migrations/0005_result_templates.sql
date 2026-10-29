ALTER TABLE email_outbox ADD COLUMN html_body TEXT;
ALTER TABLE email_outbox ADD COLUMN template_version TEXT NOT NULL DEFAULT 'result-v1';
