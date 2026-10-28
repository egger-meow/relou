# Relou deployment | Cloudflare-only

**Canonical site:** `https://relou.jjmowlab.com` (target only; not confirmed deployed).

**Current architecture:** Cloudflare Workers + Static Assets + Cloudflare D1 (SQLite) + Cloudflare Email Service native binding + Turnstile.

**Read the authoritative runbook:** [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md).

This file previously proposed a mixed Cloudflare + Supabase + SMTP architecture; that design was explicitly **superseded** by the owner. **Do not deploy to Supabase or Vercel or provision an outside backend.** Use Cloudflare-native D1 data storage and email result infrastructure as documented. **No account creation, user auth, email verification, magic links or OTP.** One-page form -> one submit -> instant success; result email only after closing the round. Real domain/D1/email provisioning requires authorized account access and must never be claimed successful without verification.
