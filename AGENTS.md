# Relou | Implementation instructions

## Latest owner correction: result email transport (2026-10-29)

The owner explicitly replaced Cloudflare Email Service with **Gmail SMTP** during review/deployment. Use `smtp.gmail.com:465` with implicit TLS from the Worker, server-only Gmail app-password secrets, and the existing paused/dry-run outbox. Do not require Workers Paid or Email Service onboarding. This overrides older Cloudflare-only email/SMTP prohibitions below and in the original specifications. Hosting and data remain Cloudflare Workers + Static Assets + D1. Never send signup/verification email. Public support contact: `jjmow.cs15@nycu.edu.tw`. Do not send live mail without sender credentials and explicit operator approval.

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
5. `docs/ANALYTICS_ADMIN_SPEC.md` (P0 public metrics + private Cloudflare Access dashboard)
6. `docs/DEPLOYMENT.md`

## Additional owner-approved P0 requirements: public stats + private admin (2026-10-29)

READ `docs/ANALYTICS_ADMIN_SPEC.md` as an authoritative P0 specification (not a future nice-to-have).

- Add an attractive **public read-only stats area to the same landing page**: *actual current-round valid submission count*, round number/status, enrollment deadline countdown, expected outcome notice date; historical submissions/previous-round pair count only when actual past data exists. Do not fake metrics or label unverified entries as authenticated people.
- **Never publicly display or return gender counts or ratios, desired gender, male/female competition, school/intent/MBTI demographic splits, individual answers, contact information or ranking; no hidden demographics in public JSON.** Public gender ratios can distort participation and users' perception of opportunity.
- Add **admin dashboard** with D1-derived overview KPIs, 7/14-day daily signup trend, flagged/spam counts, matching dry-run statistics, match commit and round state, email outbox send/failed/retry state, admin settings, audit log and safe confirm dialogs. P0 essentials first; omit fancy marketing funnels without real tracking.
- **Admin login only, NOT participant login**: serve `https://admin.relou.jjmowlab.com` as a SECOND custom domain of the SAME Cloudflare Worker and D1, protect entire admin hostname with **Cloudflare Zero Trust Access self-hosted app** allowlisting exact operator email(s), using Cloudflare IdP or Access One-time PIN. Public `https://relou.jjmowlab.com` must remain fully open without OTP/login.
- Admin Worker routes MUST validate Access JWT `Cf-Access-Jwt-Assertion` (JWKS signature, `iss`, `aud`, expiry, exact email allowlist). Do not trust mere presence of header/cookie. Deny ALL admin assets/APIs on public hostname and workers.dev/preview hostnames. No client-side admin secrets. Admin mutation is stateful/audited with double confirmation for commit/send.
- Missing Cloudflare Access org/team/AUD configuration is a deploy blocker, not a reason to create homegrown admin passwords or falsely claim Cloudflare login is already configured.
- Keep normal signup single page/one POST with NO verification email, and send only end-of-round result email via Cloudflare Email Service.

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


## Monthly lifecycle (owner correction, 2026-10-29)

Start November 2026 (no October enrollment). Taiwan time: enroll from day 1 00:00 inclusive to day 21 00:00 exclusive; match/distribute day 21 through month end. Three public tabs: form (default), stats, explanation with monthly ring diagram. Show month and sequence number. MONTHLY_ROUNDS_ENABLED controls the scheduled lifecycle; cron provisions monthly DRAFT, opens with configured sender/anti-abuse credentials and locks expired rounds with a frozen snapshot. Enrollment does not require enabling live email. Cron does not commit matches or send email; those remain operator-approved. Early matching/distribution is not implemented or enabled pending owner decision.


## Latest owner overrides: academic programs and highly compatible early allocation

The owner now explicitly requests required school -> degree (bachelor/master/doctor) -> program dropdowns, and reciprocal same-department / different-department / either hard preferences. This supersedes the old no-major rule. Use the sourced catalog documented in docs/PROGRAM_CATALOG.md; validate school/degree/program server-side and freeze canonical departmentGroup/catalog version in private answers. No public demographics or academic details in result emails. Same department means same school and canonical department across degrees; independent institutes are not fuzzy-merged.

Highly compatible early allocation is owner-approved: EARLY_MATCHING_ENABLED controls a scheduled path, minimum max(90, round threshold), known shared interest excluding Other, and all existing reciprocal hard conditions. Already allocated members are excluded from every later plan. Every allocation has an immutable allocation_batches journal, match member uniqueness, unique outbox and transactional audit; match_runs remains a single round container (its original fields are not the authority for later batches). Final manual commit settles only remaining candidates. Cron may now commit/send EARLY results under this approved policy, but only when mailReady and not early_paused; global EMAIL_DRY_RUN / EMAIL_ENABLED remain deliberate controls. Main settlement stays operator-reviewed. No early unmatched notices. No retries for uncertain delivery.
