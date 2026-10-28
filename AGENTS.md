# Relou | Implementation instructions

## Immutable UX rule (owner explicit correction, 2026-10-29)

**THE USER FILLS THE ONE-PAGE FORM, CLICKS SUBMIT ONCE, AND IS DONE.** NO account registration, NO login, NO verification link, NO OTP, NO magic link, NO confirmation email click, NO follow-up verification before or after submission. Do not add any extra step even if it seems more secure. Success means a validated entry has been committed to D1 and a confirmation screen appears immediately.

The email field is a **result-delivery destination only**. Allow any well-formed recipient Email (including Gmail); school is explicitly self-reported NYCU/NTHU, and **never claim student identity or email ownership has been verified**. Inform participant that typos may mean missed notification. Do not send verification/OTP/confirmation messages as part of enrollment.

**Domain:** `https://relou.jjmowlab.com` (target only, NOT verified live).

**Cloudflare-only:** Cloudflare Workers + Static Assets for frontend/API, D1 SQLite, Cloudflare Email Service Worker binding for result emails, Turnstile/rate limits. NO Supabase, NO Vercel, NO Postgres, NO external authentication service.

Read authoritative docs in this order:
1. `docs/PRODUCT_SPEC.md`
2. `docs/FORM_SPEC.md`
3. `docs/MATCHING_SPEC.md`
4. `docs/CLOUDFLARE_DEPLOY.md`
5. `docs/DEPLOYMENT.md`

## P0 deliverables

1. Polished Traditional Chinese mobile-first React/TypeScript/Vite/Tailwind one-page questionnaire (no major, school year, photos or mandatory MBTI). Two separate fields/roles within the SAME page: mandatory **notificationEmail** (where the user receives their match-result email; PRIVATE by default) and mandatory **contactKind/contactValue** (where their match may reach them). RECOMMEND Instagram `@handle` as the primary contact, with an explicit alternate choice `submitted_email` for those without Instagram. Never auto-share notificationEmail; share it only when explicitly selected and contact-share consent is checked. No IG login/verification or extra user step.
2. POST /api/entry: validate schema, current round=OPEN, 18+ attestation, reciprocal-match-relevant preferences, unchecked explicit contact-share/privacy consent; verify Turnstile token server-side, IP-based/email-based throttling, hidden honeypot. Save D1 entry once and return confirmation. **No authentication gate**.
3. D1 SQLite migrations: rounds, entries (normalized email + unique(round_id, normalized_email)), match runs, match members with unique(round_id, entry_id), email outbox with unique dedupe_key, operator-only audit, optional report/suppression. Email and answers are private. Use immutable round snapshot; no public read/list API for participants. No user / auth / session / OTP tables unless other necessary purposes are explicitly approved.
4. Duplicate email in same round must **not overwrite** a prior entry without proof of ownership; use safe idempotent behavior and non-enumerating public response. This is a risk limitation, not email verification. Expose operator-assisted correction or withdrawal contact information; don't create insecure unauthenticated edit/delete endpoints.
5. Round-based deterministic max-cardinality then max-score matching with strict mutual hard conditions and one counterpart max per entry. Quality threshold configurable; no LLM can override hard exclusions. Optional semantic layer OFF by default.
6. Authorized admin-only lock -> dry-run -> commit, validated frozen snapshot, D1-safe atomic batches / constraints, email outbox; avoid PG transaction syntax. Robust fake mail adapter, Cloudflare Email Service real adapter only after sender onboarding, EMAIL_DRY_RUN=true default and deliberate operator action. Only result notices and necessary operator-approved notices; **never OTP/verification or signup confirmation emails**.
7. Privacy/safety pages, public project README, Wrangler config (no made-up DB IDs or secrets), demo fixtures, tests and runbook for deployment to relou.jjmowlab.com.

## Security without user login

- This UX **trades identity assurance for low friction**. Do not tell users their email/school affiliation has been verified. Email validity/domain syntax checks only.
- Mitigate bot/sockpuppet abuse through Turnstile, per-IP/rate limits, disposable-domain restrictions if appropriate, per-round normalized-email unique key, honeypot, admin moderation and a no-reuse rule. These reduce abuse but cannot prove email ownership.
- A malicious person can enter another person's email. Consent checkboxes alone cannot prove consent. Avoid mass-emailing arbitrary recipients and protect sharing: no public directory, one match max, never include full free text/answers in messages, include contact/suppression path in notifications. Flag unusual bulk/suspicious submissions for human review, and don't promise 100% protection.
- Submission returns no private participant data. Don't expose email lookup, guesses, scoring graph or pair list. Endpoints that edit/withdraw based solely on an email string are prohibited.
- Always validate CORS/Origin and CSRF as relevant for form writes; protect admin endpoints with Cloudflare Access / strong operator secrets. Bind secrets server side only.
- No real participants or email secrets in public GitHub/CI. Log only aggregates/redacted identifiers.

## Execution

Inspect repo and docs, then IMPLEMENT actual MVP (not only specs) with small Conventional Commits. Prefer local working demo and tests over unwarranted production claims. Run install/typecheck/lint/tests/build if runner available and state accurately what ran. Without Cloudflare account access, leave deployment-ready project + manual instructions; do not claim DNS, D1 provisioning, Email Service or site live. Do not send live emails without setup, explicit approval and real-domain limits checks.
