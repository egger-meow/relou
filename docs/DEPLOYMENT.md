> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou deployment | Cloudflare-only

**Canonical site:** `https://relou.jjmowlab.com` (target only; not confirmed deployed).

**Current architecture:** Cloudflare Workers + Static Assets + Cloudflare D1 (SQLite) + Cloudflare Email Service native binding + Turnstile.

**Read the authoritative runbook:** [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md).

This file previously proposed a mixed Cloudflare + Supabase + SMTP architecture; that design was explicitly **superseded** by the owner. **Do not deploy to Supabase or Vercel or provision an outside backend.** Use Cloudflare-native D1 data storage and email result infrastructure as documented. **No account creation, user auth, email verification, magic links or OTP.** One-page form -> one submit -> instant success; result email only after closing the round. Real domain/D1/email provisioning requires authorized account access and must never be claimed successful without verification.


## Monthly lifecycle

`MONTHLY_ROUNDS_ENABLED=true` enables a 15-minute Cloudflare Cron Trigger. Its UTC schedule includes Taiwan midnight. The first round is November 2026, seeded by migration 0003. Open: November 1 00:00 Taiwan (`2026-10-31T16:00Z`); close: November 21 00:00 Taiwan (`2026-11-20T16:00Z`, exclusive). November 21–30 is the intended matching/notification window, not a fixed guaranteed send instant.

Scheduler creates the current month's draft, locks expired OPEN rounds, repairs missing frozen snapshots and opens only the matching monthly DRAFT when dates and sender/anti-abuse credentials are configured. Repeated runs do not duplicate rounds or transition audit records. Exact cutoff is enforced by the entry API even if a cron run is delayed. New-month selection does not get stuck behind an older locked round. Missing credentials leave the month DRAFT. Set the switch false to stop future automated transitions; it does not close an already open round (use the admin lock action).

Enrollment is deliberately separate from mail execution: `EMAIL_DRY_RUN=true` / `EMAIL_ENABLED=false` can remain while the form opens. Credential presence does not verify SMTP delivery. Main settlement commit/send still require admin confirmation. The owner has separately approved highly compatible early allocation under the policy below. Keep the actual inbox-delivery and Gmail account-policy/limits check before enabling live email.


## Highly compatible early distribution

Apply migration 0004 before deploying this version. It adds per-round early pause, immutable allocation batch journal and outbox phase. `EARLY_MATCHING_ENABLED=true` configures the 15-minute early schedule, but `mailReady` must also be true (`EMAIL_ENABLED=true`, `EMAIL_DRY_RUN=false`, valid sender credentials). In dry-run/disabled mode it neither reserves people nor creates early outbox. Production still has mail execution disabled pending a controlled Gmail validation; credential upload alone does not verify acceptance or delivery.

Only OPEN rounds within their signup dates are considered. Score must be at least max(90, normal round threshold), both participants must meet all hard conditions (including department), and they must share a known interest. Other and custom free text do not contribute to early scoring. This is a configurable product heuristic, not a probability of relationship success. The exact maximum-cardinality/score solver is applied to the current high-threshold pool; at most two pairs are committed per tick, and at most four early messages are dispatched to bound per-invocation D1/SMTP work. Early reservation changes the later optimization problem: the month-end solver optimizes only unallocated candidates; it cannot guarantee a globally optimal end-of-month total including irreversible early decisions.

Each decision journals its snapshot hash, digest, algorithm version, threshold and timestamp. Existing match_runs stays the round's parent ledger; allocation_batches is authoritative for each early/final snapshot and decision. Atomic D1 batches + stage guard trigger + member PK + outbox unique key prevent duplicate allocations. Repeated or stale/competing decisions roll back. Monthly lock freezes only the remaining pool. Final commit reuses the round parent and adds a single final batch, with one terminal outcome/outbox per remaining entry. Earlier entries never receive another unmatched notice.

The admin mail Pause control pauses both early matching/distribution and final sending for the round. Resume requires configured live mail and remains an explicit operator action. Early delivery shares the same claim, rejection classification, uncertain-no-retry and audit logic as final delivery. An early batch cannot mark an OPEN round NOTIFIED. Operator withdrawal/exclusion endpoints reject already allocated entries; investigate contact complaints manually and suppress any queued message as appropriate. Do not silently delete or reallocate a delivered match.

## Academic catalog

See [PROGRAM_CATALOG.md](PROGRAM_CATALOG.md) and `data/programs.csv`. Rebuild with `python scripts/build-program-catalog.py`, then run tests/typecheck/build. Privacy version v2 includes academic fields; new submissions require a catalog-valid combination. Never infer missing legacy departments; entries with unknown department cannot satisfy a constrained same/different request.
