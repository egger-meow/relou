# Relou | 清交月老

**90 秒填完、一期一次、清交限定。**

Relou is a mobile-first, opt-in, round-based 1:1 matching experiment for verified adult students at NYCU/NTHU. It prioritizes shared interests, compatible values and communication preferences, without asking for major/department or requiring a long personal introduction.

## Start here

- [Product and implementation specification](docs/PRODUCT_SPEC.md)
- [Form and copy specification](docs/FORM_SPEC.md)
- [Matching engine specification](docs/MATCHING_SPEC.md)
- [Agent implementation instructions](AGENTS.md)

**Status:** design/specification, not yet built or accepting registrations. Never upload credentials, real participant data, or SMTP passwords to this public repository.

## Production hosting

**Canonical URL: https://relou.jjmowlab.com** (target only, not yet live).

- **Cloudflare:** host the web application on Cloudflare Workers (Cloudflare's current Next.js guide recommends vinext for new applications); attach `relou.jjmowlab.com` as a Worker Custom Domain in the existing `jjmowlab.com` zone. Cloudflare creates the required DNS/certificate when configured. DNS alone is not application hosting.
- **Supabase:** separate managed project for Postgres + Auth; never assume Supabase runs inside Cloudflare. Configure allowed student email domains before accepting real registrations.
- **SMTP:** separate operator-run batch worker / GitHub Actions with SMTP secrets (not in browser or bundled into a public Cloudflare Worker).
- **Production auth:** set Supabase Auth Site URL to `https://relou.jjmowlab.com`, and allowlist the exact deployed callback path.
- Deployment steps and outstanding account access: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Proposed stack

Next.js + TypeScript + Tailwind CSS, Supabase Postgres/Auth, SMTP via Nodemailer, and Cloudflare Workers deployment. Round-based batch pairing with a deterministic, audited baseline and optional semantic-enhanced ranking.
