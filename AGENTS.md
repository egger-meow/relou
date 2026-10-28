# Relou | Coding agent contract

## User-approved direction (latest wins)

**Site:** https://relou.jjmowlab.com (deployment target; NOT yet live).

**100% Cloudflare-first:** Cloudflare Workers + Static Assets for site/API; Cloudflare D1 (SQLite) as durable database; Cloudflare Email Service `send_email` Workers binding for school-email login links and match notices; Cloudflare Turnstile / rate limits. **No Supabase, no Vercel, no Postgres or RLS, no hosted external identity platform.** Authorization must be implemented and tested in Worker handlers because D1 has no Supabase-style RLS.

Read these docs in order:
1. `docs/CLOUDFLARE_DEPLOY.md` (authoritative deployment & auth plan)
2. `docs/PRODUCT_SPEC.md`
3. `docs/FORM_SPEC.md`
4. `docs/MATCHING_SPEC.md`
5. `docs/DEPLOYMENT.md` (short pointer to Cloudflare-only runbook)

## Mission

Ship a clean, polished 90-second, mobile-first, Traditional Chinese student matching app: enrollment, adult declaration, verified NYCU/NTHU student email, opt-in contact sharing, round batch matching, private 1:1 email notifications. No department, major, school year, photo, required MBTI, lengthy self-description, public browsing, in-app chat or payment.

## Implementation targets

- UI: React + TypeScript + Vite + Tailwind; backend: Cloudflare Workers, optionally Hono routing + Zod schemas. Prefer Workers Static Assets and one deployed Worker to minimize complexity. Do **not** scaffold Next.js by default.
- Persistence: Cloudflare D1 SQLite with Wrangler migrations, unique constraints, protected per-user queries and admin-only operations. No `@supabase/*` dependencies, `service_role` keys or Vercel.
- Auth: school domain allowlist configured with verified real domains, strong single-use email magic-link tokens or strict OTP, D1 token hashing/expiry, request throttles/Turnstile, signed/opaque secure HttpOnly cookie sessions; never depend on client-supplied user id or email verification flags.
- D1 writes: SQLite constraints, batch atomic writes where supported, compare-and-swap for run commit (do not use Postgres advisory locks or `SELECT FOR UPDATE`). Immutable round snapshot/hash + idempotent outcome/outbox.
- Matching: bilateral hard preferences, symmetric explainable score, maximum-cardinality then maximum-weight matching for general graphs, deterministic tie breaks, one match per participant per round. Algorithm can use Python NetworkX offline CLI with carefully secured, validated D1 imports; prefer testable TypeScript if robust general graph solver available. Never silently replace optimal solver with greedy.
- Email: `MailSender` interface, production native Cloudflare Email Service binding (`env.EMAIL.send`), fake dev sender. Default `EMAIL_DRY_RUN=true`; explicit operator approval to send, durable D1 outbox, delivery `messageId`, bounded retry and deduplication. Cloudflare Email Service requires sending-domain onboarding/quota review; **do not assume email sending is already enabled**. This replaces original Nodemailer/SMTP plan; SMTP on port 25 is blocked from Workers. If native service unavailable, document and optionally permit explicit HTTPS provider adapter without abandoning Cloudflare hosting.
- Security: no secrets in Git, no student answers or contacts in public logs/API, no broad user-readable tables, validate origin/CSRF for session writes and enforce strict admin auth. Contact sharing requires affirmative unchecked consent, only one chosen contact per match, verified email private unless deliberately chosen.
- Production domain: configure worker custom domain `relou.jjmowlab.com` only after confirming ownership and conflicting DNS; use `PUBLIC_SITE_URL=https://relou.jjmowlab.com` for magic-link URLs and canonical metadata.

## Work order

1. Check current repo state and recent commits, then create working project with locked dependencies, Wrangler config (avoid fabricated D1 IDs), local Worker simulator + UI dev mode.
2. Implement authenticated school-email login (or safely stub behind clearly labeled demo flag while documenting production blockers), D1 migrations and all private APIs, 18+ consent, entries + withdraw.
3. Implement and test matching with dry-run/commit invariants, admin authorization and D1 outbox.
4. Implement Cloudflare native mail adapter with fake/dry-run, template preview, per-user results and retry.
5. Implement privacy/safety pages and robust mobile UI, complete dev/deploy/Cloudflare onboarding instructions.
6. Try local typecheck, lint, unit/integration tests, build and realistic demo with synthetic fixtures. State actual results, not invented success.

## Release gates

- No real signups until identity, abuse prevention, legal/privacy notices and operator contact have been verified.
- No live email without explicit send action, verified sender domain, quotas and operator-approved tests.
- Never claim domain reachable, D1 provisioned, Cloudflare bindings active or site deployed unless checked.
- Missing account credentials are not permission to use another provider. Leave deployable code and exact setup steps.
- Conventional commits; preserve existing changes; report actual SHA(s) and what is still blocked.
