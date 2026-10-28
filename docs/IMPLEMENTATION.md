# Relou MVP | Deployment and operator runbook

**Status: source code committed, NOT deployed.** No Cloudflare account, real D1 UUID, Access application, sender, DNS or production email has been provisioned. The checked-in Wrangler template contains a placeholder, not an invented ID.

## Delivered implementation

- React + Vite + TypeScript + Tailwind one-page form and actual D1-based aggregate public stats.
- Cloudflare Workers/Hono API, Zod schema, server-verified Turnstile, rate-limit bindings, honeypot, Origin check, per-round Email uniqueness. **One submit, immediate success, no participant login, Email/IG verification or signup email.**
- Cloudflare D1 migrations for rounds, entries, match runs, unique match members, outbox and admin audit.
- Reciprocal hard constraints, symmetric scores, deterministic Edmonds blossom maximum-cardinality then maximum-weight matching.
- Access-only admin dashboard: real KPIs/trend, masked entry review, open/lock/archive, side-effect-free dry-run, digest-checked commit, outbox preview/paused send/retry, audit.
- Native Cloudflare Email Service send_email binding. EMAIL_DRY_RUN=true and EMAIL_ENABLED=false by default; no live emails sent.
- Unit tests and GitHub Actions CI. Verify the actual CI status before release.

## Required Cloudflare setup

1. Obtain authorization for Cloudflare DNS zone jjmowlab.com. Check relou and admin.relou hostname conflicts.
2. Create the D1 database using: npx wrangler d1 create relou. Copy the **actual** UUID.
3. Run npm install, then npm run configure -- <REAL_D1_UUID>. This creates gitignored wrangler.jsonc from wrangler.example.jsonc. Review it. No fake UUID is accepted.
4. Apply migration: npm run db:local for local, then npm run db:remote for production **only after reviewing SQL**. Keep test and real data separate.
5. Create Turnstile for relou.jjmowlab.com. Put the public TURNSTILE_SITE_KEY in Wrangler vars, and store the secret using npx wrangler secret put TURNSTILE_SECRET_KEY.
6. Generate a random server-only pepper and store via npx wrangler secret put RATE_HASH_PEPPER. Check Workers rate limiting bindings and anti-abuse behavior.
7. Configure SUPPORT_EMAIL to a reachable operator contact. Do not open a round without a real support/privacy channel.
8. In Cloudflare Zero Trust > Access > Applications create a Self-hosted application covering **only** the entire admin.relou.jjmowlab.com hostname. Allow only exact administrator Email address(es), using Cloudflare Access One-time PIN or existing IdP. Do not protect the public relou.jjmowlab.com hostname.
9. Store CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD and ADMIN_EMAIL_ALLOWLIST as server-only Wrangler secrets. Worker verifies Access RS256/JWKS signature, issuer, audience, expiry and exact Email allowlist; never trust a forged header or merely hidden UI.
10. Onboard jjmowlab.com to Cloudflare Email Service. Verify SPF/DKIM/DMARC, sending quotas, sender approval and **actual external-recipient sending availability**. Set EMAIL_FROM to an authorized sender address. Test only with controlled inboxes.
11. Run npm run typecheck && npm test && npm run build. Deploy only after all account setup: npm run deploy. Verify HTTPS, both hostnames and Access isolation.
12. Leave EMAIL_DRY_RUN=true and EMAIL_ENABLED=false during development. After sender approval, deliberately set EMAIL_DRY_RUN=false and EMAIL_ENABLED=true, redeploy, then use admin RESUME and SEND. Never send live results before a committed match run and human approval.

**Do not commit** wrangler.jsonc, .dev.vars, Access tokens, D1 secrets or real participant data.

## Operator sequence

- Admin Access login (operators only) -> create Round DRAFT -> configure opens/closes/notification dates -> manually OPEN only after privacy, anti-abuse, sender and support checks.
- While OPEN, review actual D1 statistics and exclude suspicious entries with a reason. No unauthenticated edit/delete-by-Email endpoint exists.
- LOCK closes registration **before** hashing eligible entries. DRY-RUN is side-effect-free and returns aggregate pair count, unmatched count, quality stats and preview digest.
- COMMIT rechecks the same immutable snapshot and digest, then uses D1 atomic batch and uniqueness constraints to create exactly one match run, max one counterpart per entry and one result outbox row per eligible entry.
- Results mail is initially paused. RESUME and SEND in batches of at most 10 only after sender onboarding. PAUSE stops further batches.
- A timeout can mean an Email was accepted but the response was lost. The outbox marks these as uncertain; **never blindly retry** uncertain or sending rows. Investigate provider logs. Retry is restricted to definitively failed rows.
- When all result notices are resolved, the round advances to NOTIFIED; then ARCHIVE. After 30 days archived, use the admin PURGE control to delete participant entries, matches and email outbox while retaining only aggregate round totals. This is currently manual, not a background cron.

## Public data and privacy

GET /api/public/stats returns only round metadata, current active submission count, optional historical aggregate counts and timestamp. **No gender counts/ratios, school/intent distributions, individual answers, Email, IG or matching scores.** Counts represent unverified submissions, not verified people. Stats may lag 60 seconds.

Every user supplies a private notification Email and explicitly chooses one contact to share with their match (IG recommended or their submitted Email). There is no identity, campus or Email ownership verification. Abuse controls reduce spoofing but do not prove consent. The operator must provide a working wrong-recipient/withdrawal contact and manually verify requests.

**Known pre-launch gaps:** automatic retention cleanup and a complete complaint workflow are not implemented. Operator-controlled withdrawal (while OPEN), unsent-mail suppression and an audited personal-data purge after 30 days of ARCHIVED status are implemented, preserving historical aggregate counts. A legally reviewed privacy notice with explicit retention terms is still required. Do not open real registrations until resolved. The synchronous blossom solver intentionally refuses rounds above 500 eligible entries; scale with a reviewed offline process if needed.

## Local development

npm install -> npm run typecheck -> npm test -> npm run build.

Vite dev serves the frontend only. Full-stack local needs real D1 UUID config: npm run configure -- <UUID>, npm run db:local, npm run build, npm run dev:worker. Set ENVIRONMENT=local to permit public localhost:8787; admin still requires real Access and is **never** bypassed locally.

Official documentation:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
