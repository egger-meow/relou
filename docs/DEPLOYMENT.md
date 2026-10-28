# Relou deployment | Cloudflare Workers + Supabase

Canonical production origin: **https://relou.jjmowlab.com**. This is the target configuration only: **not yet deployed, not yet confirmed to resolve, not accepting real sign-ups**.

## Architecture

```
Browser at https://relou.jjmowlab.com
       |
       v
Cloudflare Workers / custom domain (Next.js app + API routes)
       |
       +---- HTTPS Supabase hosted project (Postgres + Auth + RLS)
       |
       +---- Cloudflare Turnstile / abuse protection

Operator-only batch CLI or GitHub Actions workflow_dispatch
       |
       +---- Supabase admin access, round lock/match, idempotent outbox
       +---- SMTP provider for 1:1 results, dry-run by default
```

Cloudflare provides the site runtime, HTTPS and DNS for the subdomain; Supabase is **not** self-hosted on Cloudflare. SMTP batch delivery and Python/NetworkX optimization stay outside the HTTP Worker to avoid serverless limits and incompatible long-lived network tasks.

## A. Cloudflare

1. Ensure `jjmowlab.com` is an active zone under the intended Cloudflare account.
2. Scaffold or adapt Next.js to **Cloudflare Workers**, following the **current** Cloudflare docs. As of 2026-10, Cloudflare recommends **vinext** for *new* Next.js-on-Workers projects. Review any compatibility report; pin working dependencies and lockfile. Do not blindly copy an older Pages/Next on Pages recipe.
3. Install and configure Wrangler appropriately; enable necessary Node.js compatibility flags only as official adapter requires. Set `NEXT_PUBLIC_SITE_URL=https://relou.jjmowlab.com` for the production build and configure **server-side secrets** in Cloudflare encrypted Worker secrets, not source code.
4. Deploy preview to a Worker preview URL; verify registration, Auth callback, RLS, and runtime support before binding the public domain.
5. Cloudflare Dashboard -> Workers & Pages -> relevant Worker -> Settings -> Domains & Routes -> Add -> Custom Domain -> `relou.jjmowlab.com`. Cloudflare will generate DNS records and HTTPS for the new Worker custom domain. Check for **existing conflicting A/AAAA/CNAME or Worker bindings** first; do not overwrite another service unintentionally.
6. Verify DNS resolution + HTTPS certificate + canonical host response with a real external request. Record success, not only a dashboard screenshot.

Official docs: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ and https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## B. Supabase (a separate managed backend)

1. Choose the intended Supabase organization **before project creation**; project creation can have a nonzero cost requiring confirmation. Select a nearby available region based on user latency and data location constraints (e.g. Singapore; verify current region list).
2. Provision project `relou` or reuse an explicitly identified Relou project; do not reuse unrelated app databases.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in app environment, and restrict `SUPABASE_SERVICE_ROLE_KEY` (or a scoped admin secret key) to operator-only processes. Do not put it in browser bundles or commit logs.
4. Apply reviewed SQL migrations, run database advisors, RLS owner checks, and basic integration tests on real backend before enabling signups.
5. In Supabase Auth -> URL Configuration:
   - **Site URL:** `https://relou.jjmowlab.com`
   - **Redirect URLs:** `https://relou.jjmowlab.com/auth/callback` *only if the implementation uses this exact callback path*, or update to the actual implemented path. Add local development callbacks separately. Avoid broad production wildcards.
   - Verify emails truly deliver and the magic-link/OTP roundtrip works on the Cloudflare custom domain.
6. Confirm eligible NYCU/NTHU student-email domains from official school documentation before adding to `SCHOOL_EMAIL_DOMAINS_JSON`. Domain allowlists should remain configurable and checked server-side.
7. Configure appropriate auth mail delivery limits, abuse prevention and verified sending domain before opening first round.

Official Auth docs: https://supabase.com/docs/guides/auth/redirect-urls

## C. SMTP and first round

- Results are sent through a separately executed operator CLI / protected GitHub Actions workflow with SMTP credentials. **Never expose SMTP credentials in Cloudflare public env vars or a Next.js client bundle**.
- Local preview and test runs must default to `EMAIL_DRY_RUN=true`; real deliveries need deliberate admin approval after matching snapshot is committed.
- Configure sender domain/SPF/DKIM/DMARC, rate limits, bounce handling and outbox retry before scaling past a small sample.
- First operator dry-run should show aggregate counts only; test matched and unmatched recipients, then verify a couple of consented test inboxes before sending real notifications.

## D. Release gates

- [ ] Cloudflare Worker builds and runs in production-like preview
- [ ] `relou.jjmowlab.com` custom domain added without breaking existing records
- [ ] HTTPS certificate and DNS verified
- [ ] Supabase Relou project selected, migrations applied, RLS tested
- [ ] Auth emails + redirect URLs tested on **real** custom domain
- [ ] School domain allowlist verified
- [ ] Explicit 18+/privacy/contact sharing flow tested
- [ ] SMTP dry-run + idempotent outbox + recovery test passed
- [ ] Privacy/safety pages and operator contact visible
- [ ] Admin explicitly opens Round 1

## E. Access limits

At specification stage the GitHub repo can be updated via connected GitHub tools. This does **not** grant Cloudflare-account access or prove this domain already resolves. Unless an authorized Cloudflare integration/account is available, **do not report that DNS, Workers, certificates, or production deployment are done**. Likewise, do not claim Supabase project creation or database deployment without an actual successful Supabase operation.

If Cloudflare deployment cannot be executed by the available agent tools, prepare build/config/CI instructions and report the precise remaining Cloudflare dashboard steps. 
