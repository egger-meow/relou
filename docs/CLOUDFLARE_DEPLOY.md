# Relou | Cloudflare-only architecture & release runbook

**Public URL (target, not yet deployed):** `https://relou.jjmowlab.com`

> Authoritative deployment decision made 2026-10-29: **Do not use Supabase or Vercel. Deploy website, backend, persistent data and transactional email through Cloudflare-native services.** This document supersedes older implementation suggestions if a conflict remains.

## 1. Components

| Concern | Cloudflare-first choice | Notes |
| --- | --- | --- |
| Site / API hosting | **Cloudflare Workers + Static Assets** | Single Worker serving UI and private API; `relou.jjmowlab.com` via Workers Custom Domain |
| UI | **React + TypeScript + Vite + Tailwind** | One mobile-first form, no mandatory Next.js/SSR. Can use Hono for routing |
| Backend/API | **Cloudflare Workers (Hono)** | Request validation (Zod), owner authorization, school email OTP, form submission and consent |
| Database | **Cloudflare D1 (SQLite)** | Schema migrations through Wrangler; SQL constraints, transactions / D1 batch where applicable, auditable match commit |
| Email verification | **D1-backed OTP / one-time magic link**, sent via Cloudflare Email Service binding | Must implement secure, expiring, single-use token (hash in DB), generic anti-enumeration responses, email/domain validation and session management; never accept an unverified email |
| Result emails | **Cloudflare Email Service send_email Workers binding**, via durable D1 outbox | Prefer native binding over sending SMTP from a Worker; Cloudflare Email Service supports SMTP for external clients but binding is more direct inside Workers |
| Antibot | **Cloudflare Turnstile + rate limits** | Verify challenge server-side; throttle OTP, submit, session, reports |
| Batch matching | **Cloudflare Worker authorized operator path or offline local CLI** | For P0 allow a local matching job to read/write D1 using authenticated Wrangler/admin tooling; build carefully to avoid exposed mass-email endpoints |
| Background job | **Workers Cron Triggers, optionally Workflows/Queues** | For outbox retry/batch only, optional until proven necessary. Round lock & match commit remain explicit admin steps |
| Secrets / config | **Wrangler secrets, Cloudflare Dashboard** | Never use GitHub public secrets or client-visible vars |
| Domain/TLS | **Cloudflare Workers Custom Domain** | When Cloudflare manages the `jjmowlab.com` zone, use Workers custom domain; this provisions DNS & certificate automatically |

## 2. Why NOT Supabase, SMTP Node, or Vercel

- No `@supabase/*`, Supabase Auth, PostgreSQL, service-role key, RLS SQL, or Vercel project.
- D1 SQLite requires SQL authorization enforced **in every Worker handler**; no row-level security magically applies. Never trust just a user id from request JSON, and never expose a D1 binding or internal APIs to the browser.
- For a tiny campaign, Cloudflare Workers static assets and Hono fit better than adding a Next.js compatibility adapter. If code later requires Next.js, Cloudflare currently documents `vinext` as its preferred Next.js Workers path; choose it only with tests.
- Previous idea `SMTP Nodemailer` is **replaced** by Cloudflare Email Service native `send_email` binding. This provides transactional email from Cloudflare with no custom SMTP client in a Worker, subject to sender-domain onboarding, quota/plan availability, and real delivery validation.
- The Cloudflare Email Service sending feature is beta as of 2026-10-29; inspect account availability and sending limits before launch. If unavailable, keep a `MailSender` interface and implement an explicitly configured HTTPS transactional provider, keeping Worker & D1 hosting Cloudflare-native. Never silently switch vendors or claim email is ready.
- No raw SMTP over Worker port 25 (blocked); Workers support outbound TCP `connect()` for some other ports, but SMTP compatibility/operability is not the default architecture.

## 3. Suggested project structure

```txt
src/
  ui/                  # React responsive Chinese form, success/status screen
  worker/index.ts      # Cloudflare Worker fetch/scheduled handlers
  worker/routes/       # auth, entries, round, admin/report
  worker/lib/          # D1 queries, signed sessions, mail adapter, config
  shared/              # Zod schema + answer enums and match invariants
  matching/            # matching engine, graph solver, tests
migrations/
  0001_init.sql        # D1 SQLite schema, indexes, constraints
  0002_....sql
tests/
wrangler.jsonc
.env.example           # non-secret local names only
.dev.vars.example      # local Worker secrets example (never real values)
```

For matching, an offline Python NetworkX solver is acceptable if the worker operator CLI can **safely export only locked eligible entries to a protected local process** and import a validated match plan in a single audited commit. Prefer pure TypeScript matching if a tested general-graph solver is available; never substitute greedy matching without explicitly agreeing to a lower guarantee.

## 4. Identity & session security

1. Verify that submitted email belongs to a configured *approved student domain* for NYCU/NTHU. Domain validation must be precise and consider known school subdomains; do not trust arbitrary free-mail aliases.
2. OTP: use a cryptographically secure random code/token, store only keyed hash in D1, 10-minute expiry, 1-use semantics, abuse throttling, and neutral email sending responses to avoid account enumeration. A 6-digit OTP requires aggressive attempt counters and IP/email throttling; prefer at least 128-bit magic-link token.
3. Session: secure random session ID, hashed in D1, `HttpOnly`, `Secure`, `SameSite=Lax` cookie, expiry + revocation. CSRF protection for state changes (Origin validation + CSRF token as needed), and no tokens in logs. Mark verified school only by server-backed state.
4. Local dev can run **clearly labeled demo auth bypass for synthetic fixture data only**, guarded by `ENVIRONMENT=local` and NEVER allowed in preview/production.
5. All data writes validate session owner and round state. D1 queries scoped with `WHERE user_id = session.user_id`. Admin endpoints disabled by default and authenticated with constant-time token or Cloudflare Access; never reuse normal user sessions for admin.
6. Do not expose app state, raw candidate answers, school email, IG/contact, or pairing graph to public endpoints. Sanitize all email and HTML outputs.

## 5. D1-specific correctness

- SQLite foreign keys, uniqueness `UNIQUE(round_id, user_id)`, `UNIQUE(round_id, entry_id)` on match members; index `email_outbox(dedupe_key)`, `sessions(token_hash)`, `otp_tokens(token_hash)`.
- Since D1 is a distributed cloud database API, avoid reliance on `SELECT FOR UPDATE`, PostgreSQL advisory locks and multi-request transactions. Use **single-statement compare-and-swap status update** plus D1 `batch()` for atomic writes as documented and SQLite constraints as final authority. Ensure `match_run_id` unique commit guard.
- Any matching graph export needs an immutable snapshot ID & hash. A commit must re-check round locked state, exact frozen entries, and every result invariant. Reject a stale plan.
- `dry-run` never writes matches; it may produce ephemeral aggregate statistics or operator-only plan artifacts.
- Do not assume writes to one table imply idempotent email delivery; outbox enqueue must be atomic with match commit, and dispatch retries bounded.
- Clean up expired OTP/session data and old unneeded entries according to documented retention, with deletion requests.

## 6. Email sender, sender-domain and quotas

- Configure Cloudflare Email Service sending for the `jjmowlab.com` zone and verified sender such as `no-reply@jjmowlab.com`; the sender is a **proposed address** and must be provisioned, not assumed to exist.
- Cloudflare Email Service may initially limit quota. **Before a large round**, check actual account daily limit, send rate, bounce handling and suppression. One notification per participant, no batch BCC lists.
- Verify SPF, DKIM and DMARC, preview templates, and run an actual end-to-end test only with operator-approved test addresses.
- Prefer a reusable `MailSender.send` abstraction backed by `env.EMAIL.send({ to, from, subject, text, html })`; tests use fake sender. All production sending gated by explicit `EMAIL_DRY_RUN=false` and send authorization.
- Retain email outbox with unique `dedupe_key`, attempt counts, last error and provider `messageId`. A connection timeout can have uncertain delivery; require trace/confirmation before repeated sends.
- Cloudflare native sender is not the same thing as SMTP from Nodemailer; feature intent (reliable email notifications) is preserved.

## 7. Domain, deploy, and checklist

- Cloudflare must manage DNS for `jjmowlab.com` zone, or the operator must choose another externally routed domain arrangement. **Do not modify DNS until account ownership and existing records are checked.**
- Add Worker custom domain `relou.jjmowlab.com` through Wrangler `routes: [{ pattern: "relou.jjmowlab.com", custom_domain: true }]` or Cloudflare Dashboard.
- Configure `PUBLIC_SITE_URL=https://relou.jjmowlab.com` for redirects, links, canonical metadata and email verification callback. Keep previews on separate hostname to avoid opening real registrations.
- Create D1 database (e.g. `relou-db`), bind `DB` in `wrangler.jsonc`, apply migrations to local and remote. **Never invent a database ID** in repo. Commit an example config until actual ID is known.
- Before deploying enable static hosting/API, secret storage, Turnstile and optionally Email Service. Verify available Cloudflare account permissions or request operator connection. There is no direct Cloudflare connector in this chat; **no Cloudflare infrastructure has been created by this spec**.
- After deployment verify TLS, actual custom hostname, one test OTP/login, one synthetic form submit, zero public PII leakage, operator lock/dry-run, dummy match and one operator-approved mail test. Set enrollment OPEN only after manual go/no-go.
- Set production privacy/contact page with real operator contact method, retention policy and contact-sharing consent. Never launch an unsafe demo into the public intake.

## 8. Runtime URLs for implementers

- Worker Custom Domain docs: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Cloudflare D1 docs: https://developers.cloudflare.com/d1/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Workers Email Sending: https://developers.cloudflare.com/email-service/get-started/send-emails/
- Email Workers binding: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- Email Service sending limits: https://developers.cloudflare.com/email-service/platform/limits/
- Turnstile: https://developers.cloudflare.com/turnstile/
- Workers Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Acceptance criteria for Cloudflare version

1. No dependency/configuration that calls Supabase or Vercel.
2. Local Worker + D1 migrations + UI + fake email sender and dummy fixtures run with documented commands.
3. Correct school email verification, per-round unique entry, private sessions, no cross-user access and safe withdrawal.
4. Matching engine tests cover reciprocal hard filters and global maximum-cardinality objective.
5. Outbox processing is resumable and **never sends production email by default**.
6. Wrangler deployment config targets `relou.jjmowlab.com` without fake database IDs or hardcoded secret values.
7. Actual hostname only called *live* after TLS and DNS have been verified.
