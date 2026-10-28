# Relou | Cloudflare-only deployment & single-submit architecture

> **Canonical target domain:** `https://relou.jjmowlab.com`. **User flow MUST be single page -> click submit -> immediate success. NO login / email verification / OTP / magic link / email confirmation.** This supersedes every older draft. Not yet deployed or confirmed live.

## 1. End-to-end plan

```text
Browser at relou.jjmowlab.com
  -> React/Vite/Tailwind one-page form (school self-report + result email + interests/preferences/consents)
  -> POST /api/entry (Hono Worker, Zod + Turnstile server verification + rate limiting)
  -> D1 SQLite INSERT (unique(round_id, normalized_email), round must be OPEN)
  -> JSON receipt + immediate on-screen confirmation
  [NO PRE-SUBMISSION OR POST-SUBMISSION EMAIL, NO LOGIN]
  ... end of round ...
  -> Admin-only lock / review / dry-run / commit matching
  -> D1 email outbox
  -> Cloudflare Email Service -> one result email per entry
```

## 2. Stack

| Component | Platform | Notes |
| --- | --- | --- |
| UI + backend | Cloudflare Workers + Static Assets | React + TypeScript + Vite + Tailwind; Hono + Zod |
| Persistence | Cloudflare **D1 SQLite** | Entries, round, matches, score metadata, outbox; no Postgres |
| Email | Cloudflare **Email Service `send_email` binding** | **Result notifications ONLY** and exceptional operator-approved notices; not validation/auth/signup confirmation |
| Abuse protection | Cloudflare **Turnstile**, Worker rate limits, honeypot | Invisible/managed challenges where possible; guard anonymous submit |
| Round engine | Admin CLI + matching library | Can run offline Python NetworkX with secure D1 export/commit; never public trigger |
| Secrets | Cloudflare Workers secrets, Wrangler | No secrets in Git and no client key for D1 |
| Domain/TLS | Workers Custom Domain | `relou.jjmowlab.com`; requires access to `jjmowlab.com` Cloudflare zone |
| Identity | **None in MVP** | No accounts, sessions, OTP, school student verification or authenticated user profile |

**Supabase, Vercel, Postgres/RLS, Nodemailer SMTP and custom OTP/magic-link auth must not be added.**

## 3. Input and single-POST behavior

- User chooses school NYCU/NTHU (self-declared, NOT verified), types **any valid deliverable-looking email string** (including Gmail), and selects matching preferences on same page. Requires adult 18+ self-attestation, contact-share opt-in and privacy consent as in `docs/FORM_SPEC.md`.
- On submit: server validates same answer schema, current round is OPEN and current timestamp within configured range, checks Turnstile server-side, applies rate limits and honeypot; perform atomic insert and return generic receipt. **No email is sent at submission.**
- Avoid email format false positives by bounded field length and standard parsing, but format/domain syntax **cannot prove ownership or guarantee delivery**. Never claim NYCU/NTHU student identity verified.
- Unique per round normalized email, but this is **not** equal to unique real person. For duplicate submissions never leak former entry or allow malicious overwrites; return neutral result to avoid email enumeration. Consider temporary anonymous submission key for accidental network retry (stored client-side with no user identity), but do not add a forced follow-up step.
- No public `GET /api/entry/me`, user lookup by email, or `DELETE/PATCH` requiring only an email. For corrections/withdrawals give a human contact and request enough evidence before making private changes.
- Because email is unverified, someone may submit another person's inbox; **protect against unsolicited/incorrect matches and erroneous contact disclosure** with rate limits, anomaly review, per-round cap and one counterpart only, a verified operator sender, support/suppression instructions, minimum content disclosure. Acknowledge that these measures reduce but cannot eliminate spoofing.

## 4. D1 and admin

Suggested schema:
- `rounds`: id, slug, status, opens_at, closes_at, settings_json.
- `entries`: id, round_id, normalized_email, school_claimed, answers_json, nickname, contact_value, consent flags, status, created_at, `UNIQUE(round_id, normalized_email)`.
- `match_runs`: run_id, round_id, snapshot_hash, algorithm_version, seed, status, metrics_json.
- `matches`, `match_members` (round-scoped unique entry), `email_outbox` (unique round+entry+template dedupe key), `admin_audit_events`, optional suppression/abuse reports.

**Do not create auth users, user sessions or OTP storage.** D1 bindings run on server only. No public participant data read APIs. Admin operations are protected via Cloudflare Access or a strong server-side admin secret and may run via operator CLI. Keep logs redacted. Use D1 SQLite atomic `batch()`, conditional updates (CAS), unique constraints; no PostgreSQL advisory locks or `SELECT FOR UPDATE`. Frozen snapshot hash must match committed plan. One entry has at most one match per round. Dry-run never alters committed matches or outbox.

## 5. Result mail only

- The user gets **NO email immediately after signup**. The only normal outbound email is the final matched/unmatched result at the end of the round.
- Cloudflare Email Service native binding needs sender onboarding, SPF/DKIM/DMARC and quota checks; **may be beta/plan dependent**. Check actual availability before relying on it. If unavailable, keep `MailSender` abstraction and clearly document a deliberately configured HTTPS email provider fallback without altering Cloudflare data/hosting; never silently use unapproved external service.
- Default `EMAIL_DRY_RUN=true`, fake sender in local tests. Admin must explicitly approve `send` once match plan is committed. One recipient per email, no bulk BCC, no leaking the entire roster, no full open-answer transcript, no public compatibility score.
- Ensure no PII in CI logs or URL query params. Idempotent outbox prevents new matches or mass resends; transport uncertainty after timeout may still require manual audit.
- Include wrong-recipient / not-participated contact and suppress future mail path. Do not claim unverified emails were consented to by actual recipients.

## 6. Build/config/deploy

- Prefer `src/ui`, `src/worker`, `src/shared`, `src/matching`, `migrations`, `tests`.
- Add `wrangler.jsonc` with Workers Static Assets, D1 DB binding `DB`, proposed `routes: [{ pattern: "relou.jjmowlab.com", custom_domain: true }]`; DO NOT invent a production D1 database ID.
- Cloudflare zone `jjmowlab.com` must be authorized and verified, existing DNS for `relou` checked before attaching new Worker; Worker Custom Domain can provision DNS and HTTPS.
- Set `PUBLIC_SITE_URL=https://relou.jjmowlab.com` for canonical links and outgoing result email links (not email login callbacks).
- Create a dedicated D1 database and apply Wrangler migrations local and remote; use encrypted Workers secrets for Admin/Turnstile; configure native email binding only after sender is approved. `.dev.vars` and real credentials never enter Git.
- Deploy preview to a non-public hostname with only **synthetic data**; test one-page submit and no unexpected network calls/verification email, D1 persist, matching and dry-run sender, duplicate handling and private reads.
- Before opening round: real domain HTTPS tested, Cloudflare Email Service sending quota checked, actual personal-data privacy notice and operator contact published, anti-abuse and deletion workflow tested, admin explicitly enables OPEN.

## 6A. 公開統計與 Cloudflare Access 管理後台（必做）

見 [ANALYTICS_ADMIN_SPEC.md](ANALYTICS_ADMIN_SPEC.md)。實作前後端、Cloudflare 網域及操作驗收都以該規格為準。

**單 Worker 兩個 hostname**：
- `https://relou.jjmowlab.com` 公開 landing + 表單 + 匿名 aggregate stats；從 API 只回本期實際有效報名份數、期次/截止與必要公開資訊，**不公開性別或其他人群分布**。
- `https://admin.relou.jjmowlab.com` 只有 Cloudflare Zero Trust Access self-hosted app 精確 email allowlist 可進。Dashboard 讀 D1 統計：每日報名、有效/可疑、期次、配對結果及寄信隊列；提供受保護操作與審計。一般報名者**仍完全不登入、不驗證 Email**。

Wrangler custom domain config 應包含兩個 hostname，注意 `jjmowlab.com` active zone 與可能 DNS 衝突。這並不需要第二個 Worker/D1。只有管理 hostname 套用 Access policy，**不可用 Worker-wide Access 將公開報名端也鎖住**。在 API 端仍核驗 `Cf-Access-Jwt-Assertion` 的有效 JWKS 簽章、`iss`、`aud`、`exp` 和管理員 email allowlist，並拒絕公共/preview/worker.dev hostname 的所有 admin 路徑。Access Team domain、Audience Tag 與管理員完整 email 清單放 server-only 配置，不能公開在 JS。

Cloudflare Dashboard > Zero Trust > Access > Applications 建立 self-hosted application 保護整個 `admin.relou.jjmowlab.com`，配置 Cloudflare IdP 或專屬 Access One-time PIN，只放指定的**完整**管理員 Email，不要讓 `@nycu.edu.tw` 任意學生登入。這個登入只給管理員，不是一般學生的 Email 驗證。

官方文件：
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/

## 7. Acceptance checks

1. Phone visitor can complete form and see success with exactly **one form POST**. Zero OTP/magic link and zero registration-triggered email. No account or login modal.
2. Domain/email syntax can be checked but there is **no verification of campus status or email ownership**.
3. Email spoof submissions cannot overwrite existing entries or query their data.
4. Synthetic fixtures prove reciprocal hard compatibility and one match per entry with maximum-cardinality optimization.
5. D1 data stays server-side; only admin can lock/commit/send, and mail dispatch defaults to dry-run.
6. Custom domain `relou.jjmowlab.com` target is documented; never label it live absent actual deploy & TLS verification.

Official docs:
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/turnstile/
- https://developers.cloudflare.com/email-service/get-started/send-emails/
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/platform/limits/
