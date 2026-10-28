# Relou | 清交月老

**90 秒填完、一期一次、清交限定。**

Relou is a mobile-first, opt-in, round-based 1:1 matching experiment for verified adult students at NYCU/NTHU. It prioritizes shared interests, compatible values and communication preferences, without asking for major/department or requiring a long personal introduction.

## Start here

- [Product and implementation specification](docs/PRODUCT_SPEC.md)
- [Form and copy specification](docs/FORM_SPEC.md)
- [Matching engine specification](docs/MATCHING_SPEC.md)
- [Agent implementation instructions](AGENTS.md)

**Status:** design/specification, not yet built or accepting registrations. Never upload credentials, real participant data, or SMTP passwords to this public repository.

## Proposed stack

Next.js + TypeScript + Tailwind CSS, Supabase Postgres/Auth, SMTP via Nodemailer, and Vercel deployment. Round-based batch pairing with a deterministic, audited baseline and optional semantic-enhanced ranking.
