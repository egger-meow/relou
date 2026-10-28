# AGENTS.md | Relou MVP implementation contract

You are implementing the actual code for **Relou**, not merely rewriting documentation. Read in this order:
1. `docs/PRODUCT_SPEC.md`
2. `docs/FORM_SPEC.md`
3. `docs/MATCHING_SPEC.md`

Target: **one professional mobile-friendly form, school-email verification, round-based private 1:1 matching, SMTP results**. **Production domain is https://relou.jjmowlab.com. Host the web app on Cloudflare Workers, with a separate managed Supabase database/auth project. Do not use Vercel for production.** Do not overbuild social features. Work in small conventional commits and complete as much production-grade MVP as the execution environment allows. If another agent has already progressed, inspect repo/history before changing files; preserve existing implementation.

## Non-negotiables

- NO department/major question. NO required MBTI, photo, long personal statement, birthday, phone or precise location.
- Verified adult NYCU/NTHU participant only, mutually acceptable gender/intention/campus filters; per-round maximum one partner.
- Explicit UNCHECKED consent before contact information is shared. Verified school email is **private by default**.
- User answers / email / IG and matching results cannot be listed by public endpoints, client-side secrets, browser console or logs.
- SQL migration(s) and RLS; authorization should compare `auth.uid()` to owner, not only `TO authenticated`. Never grant anon access to private participant tables. Never authorize from user-controlled `user_metadata`.
- No public server endpoint that can match or mass-email without admin auth. Use CLI / protected GitHub Actions instead.
- Avoid accidentally sending real mail. `EMAIL_DRY_RUN=true` default; outgoing email only after explicitly configured secrets and an operator send action.
- Test no-match and partial SMTP failure cases. Include runbook.
- Never commit secrets, real contact info, school email addresses or user data.

## Execution order

1. Inspect repo, initialize Next.js TypeScript Tailwind project and a small polished mobile-first design with Traditional Chinese copy and responsive / accessible form. Target Cloudflare Workers deploy compatibility from the start; use Cloudflare's current recommended Next.js runtime/build adapter (vinext for new apps as of 2026-10), pin versions and run local compatibility/build tests.
2. Add Zod form validation, Supabase Auth magic link flow, verified school domain allowlist, per-round DB schema and RLS migrations. Provide local fake data mode **clearly marked demo** when external credentials unavailable; never pretend production is live.
3. Implement one-time round enrollment, edit/withdraw, lock state and status pages. Keep the UI friction low.
4. Implement pure matching function + explicit hard compatibility filters + weighted score and deterministic solver. Prefer Python/NetworkX offline CLI with stable seed and fixtures. Verify with unit tests, including a graph where naive greedy is suboptimal.
5. Add safe dry-run, commit, email outbox and SMTP sender, templates, retry/idempotency tests; wire operator-run GitHub Actions `workflow_dispatch` only where safe. SMTP sending must execute as a separate CLI/GitHub Actions batch task, not long-lived in Cloudflare HTTP Workers.
6. Add landing and privacy/safety pages, email templates, `.env.example` and complete operational README with first launch checklist. Follow `docs/DEPLOYMENT.md`; configure Cloudflare Workers custom domain `relou.jjmowlab.com` and Supabase Auth Site/redirect URLs if the necessary account access is actually available; never claim completed domain or database provisioning without verification. If time, implement P1 only after all P0 tests pass.

## Validation

- Run (or try to run) package install, typecheck, lint, tests, build, plus Python tests. Never claim a test passed unless it actually executed.
- If no local runner exists in the available automation/tools, still commit source + tests and report that runtime validation is pending.
- If connecting to real Supabase is unavailable, commit migrations and a runbook; do not invent deployed database state.
- If Cloudflare Workers deployment or Supabase configuration needs external auth, domain permissions, or billing confirmation, leave a ready-to-deploy codebase and precise setup steps; do not state that the site is live.
- When blocked by missing secrets, leave precise env var names and safe setup steps. Do not ask nonessential questions.

## Suggested implementation parameters

- `MIN_PAIR_SCORE=55` initial; `EMBEDDINGS_ENABLED=false`; `EMAIL_DRY_RUN=true`.
- Round starts configured by DB records or env, not hardcoded to a specific 2026 date.
- For students, school email domain allowlist must be **verified against real supported domains** before a public launch; use environment config. Avoid assumptions about alumni or departmental subdomains.
- Optional open answer <= 100 chars; never require it or use its content to override hard filters.
- Branch workflow: commit directly if no review policy exists; otherwise use a PR. Use Conventional Commits.

## Deliverables

- Working source code, tests, migrations, runbook, generated sample email previews, example data and commands.
- Summarize actual commits, real tests executed, missing secrets/configuration, and whether deployed / production-ready.
- Prefer a useful partial build over a stalled design debate.
