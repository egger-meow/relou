> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou deployment | Cloudflare-only

**Canonical site:** `https://relou.jjmowlab.com` (target only; not confirmed deployed).

**Current architecture:** Cloudflare Workers + Static Assets + Cloudflare D1 (SQLite) + Cloudflare Email Service native binding + Turnstile.

**Read the authoritative runbook:** [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md).

This file previously proposed a mixed Cloudflare + Supabase + SMTP architecture; that design was explicitly **superseded** by the owner. **Do not deploy to Supabase or Vercel or provision an outside backend.** Use Cloudflare-native D1 data storage and email result infrastructure as documented. **No account creation, user auth, email verification, magic links or OTP.** One-page form -> one submit -> instant success; result email only after closing the round. Real domain/D1/email provisioning requires authorized account access and must never be claimed successful without verification.


## Monthly lifecycle

`MONTHLY_ROUNDS_ENABLED=true` enables a 15-minute Cloudflare Cron Trigger. Its UTC schedule includes Taiwan midnight. The first round is November 2026, seeded by migration 0003. Open: November 1 00:00 Taiwan (`2026-10-31T16:00Z`); close: November 21 00:00 Taiwan (`2026-11-20T16:00Z`, exclusive). November 21–30 is the intended matching/notification window, not a fixed guaranteed send instant.

Scheduler creates the current month's draft, locks expired OPEN rounds, repairs missing frozen snapshots and opens only the matching monthly DRAFT when dates and sender/anti-abuse credentials are configured. Repeated runs do not duplicate rounds or transition audit records. Exact cutoff is enforced by the entry API even if a cron run is delayed. New-month selection does not get stuck behind an older locked round. Missing credentials leave the month DRAFT. Set the switch false to stop future automated transitions; it does not close an already open round (use the admin lock action).

Enrollment is deliberately separate from mail execution: `EMAIL_DRY_RUN=true` / `EMAIL_ENABLED=false` can remain while the form opens. Credential presence does not verify SMTP delivery. Matching commit/send still require admin confirmation and sending flags; cron never commits or sends. There is no automatic early distribution yet. Keep operator review and the actual inbox-delivery check before enabling live email.
