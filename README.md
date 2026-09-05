# BrandSight

BrandSight is a free, AI-powered marketing audit tool: a business answers a
structured set of questions (optionally adding their website, social
profiles, competitors, and brand assets), and gets back a BrandSight
Score, eight dimension scores, evidence-backed findings, prioritized
recommendations, and a 30-day action plan. It's built as a lead-generation
tool for Blitz SMA.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions, `proxy.ts` middleware)
- **React 19**
- **TypeScript**, **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage), accessed via `@supabase/ssr` and `@supabase/supabase-js`
- **OpenAI** (Responses API, structured outputs) for the AI audit pipeline
- **Zod** for validation, **Vitest** for unit/integration/security tests, **Playwright** for E2E
- **@react-pdf/renderer** for PDF report generation, **Cheerio** for server-side HTML parsing

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in real values — see below
```

You need:

1. **A Supabase project.** Create one at [supabase.com](https://supabase.com), then copy its Project URL, publishable/anon key, and service_role key from Project Settings → API into `.env.local`.
2. **An OpenAI API key** with access to the model set in `OPENAI_MODEL` (defaults to `gpt-5.5-mini` if unset).

Then apply the database schema (see below) and run:

```bash
npm run dev
```

## Database setup

The schema lives in `supabase/migrations/0001` through `0007`, applied in
order. With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked
to your project:

```bash
supabase db push
```

Or apply them directly with `psql` against your project's connection string,
in filename order — each migration is idempotent-safe to re-run
(`create table if not exists`, `create or replace function`, etc.) but must
run in sequence since later migrations depend on earlier ones (e.g. RLS
policies in `0005` reference tables created in `0001`-`0003`, and `0007`
locks down a function created in `0004`).

What each migration does:

| Migration | Contents |
|---|---|
| `0001` | Extensions, `profiles`, `brands` and brand sub-profile tables |
| `0002` | `audits` and all audit-scoped child tables (responses, evidence, dimensions, findings, recommendations, action plans, assets, website sources) |
| `0003` | `leads`, `audit_shares` (public sharing), `rate_limit_events` |
| `0004` | Triggers (`updated_at` maintenance, auto-provisioning a `profiles` row on signup) and two `SECURITY DEFINER` RPCs |
| `0005` | Row Level Security — every table, owner-chain policies |
| `0006` | The `brand-assets` Storage bucket and its access policies |
| `0007` | Locks down `try_lock_audit_processing`'s default PUBLIC execute grant to `service_role` only (see "Security notes" below) |

### Demo data

`supabase/seed/northstar_coffee.sql` seeds one complete, realistic Quick
Audit ("Northstar Coffee", a fictional local coffee shop) — a brand, all
its sub-profiles, 17 audit responses, all 8 dimension scores, 4 findings,
2 linked recommendations, and a 30-day action plan. It's useful for seeing
the dashboard, report, all 8 dimension pages, and the action plan without
waiting on a real OpenAI call.

It needs a real `auth.users` row to attach to — create one first (sign up
through `/signup`, or add a user from the Supabase dashboard's Auth →
Users), then run:

```bash
psql "$DATABASE_URL" \
  -v demo_user_id="'<the-user-uuid>'" \
  -f supabase/seed/northstar_coffee.sql
```

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest (unit + integration + security suites)
npm run build       # next build
npm run test:e2e    # playwright — needs a running app + real Supabase/OpenAI
```

`npm run test` runs 82 unit tests covering the deterministic scoring
engine, priority ranking, SSRF IP-range classification, validation
schemas, and the audit question config — all executed and passing.
It also collects (but skips by default) integration and security suites
that need a real, reachable Supabase project: see
`tests/helpers/liveEnv.ts`. Set `RUN_LIVE_INTEGRATION_TESTS=1` (with real
credentials in the environment) to run them; `RUN_LIVE_E2E_TESTS=1` for
the Playwright happy-path spec.

The full migration chain, its RLS policies, and the `0007` function
privilege lockdown have been verified end-to-end against a local Postgres
16 instance with a minimal stand-in `auth`/`storage` schema (this sandbox
has no network access to Supabase itself) — not just against a real
Supabase project. Confirming the same behavior there, and running the
live integration/E2E suites above, is worth doing once before launch.

## Architecture notes

- **The AI never invents the score.** `src/lib/scoring/` is a deterministic,
  weighted scoring engine — the AI pipeline produces qualitative analysis
  (subcriteria ratings, findings, recommendations) and this engine turns
  that into the actual numbers, renormalizing over whatever evidence was
  actually available rather than treating "unavailable" as zero.
- **The AI pipeline** (`src/lib/ai/pipeline/`) runs 9 stages; stages 2, 6,
  and 9 are deterministic application code rather than AI calls, by
  design — evidence analysis, prioritization ranking, and report assembly
  don't need an LLM once the qualitative stages have run.
- **SSRF protection** (`src/lib/evidence/`) blocks localhost, private/
  reserved IP ranges, and the cloud metadata endpoint, both on the initial
  URL and on every redirect hop. The pure IP-classification logic lives in
  `ipRangeCheck.ts` (no `server-only` import) specifically so it's unit
  testable without a server context.
- **Brand profile vs. audit responses.** Brand-level data (`brands` and its
  sub-tables) is the canonical, reusable profile, editable from the Brand
  detail page. Starting an audit snapshots relevant brand data into that
  audit's `audit_responses` rows, so a later edit to the brand profile
  doesn't retroactively change a completed audit's report.

### Security notes

- `try_lock_audit_processing` is a `SECURITY DEFINER` function (it bypasses
  RLS to atomically claim an audit for processing). Postgres grants EXECUTE
  on new functions to `PUBLIC` by default, which would let any authenticated
  or anonymous caller flip an arbitrary guessed audit UUID to "processing" —
  migration `0007` revokes that and grants EXECUTE to `service_role` only.
- The service-role Supabase client (`src/lib/supabase/admin.ts`) is guarded
  with `import "server-only"` so an accidental client-bundle import fails
  the build instead of shipping the key.
- Every AI-cost-incurring or abuse-prone action goes through the DB-backed
  rate limiter in `src/lib/security/rateLimit.ts` before doing real work.

## What hasn't been run live

This build was carried out in a sandboxed environment whose network policy
blocks outbound access to `supabase.co`, `api.openai.com`, and
`fonts.googleapis.com`. As a direct result:

- The app has never been run against a live Supabase project or a real
  OpenAI key — no live signup/login, no live RLS check through the actual
  Supabase Auth/PostgREST stack, and the 9-stage AI pipeline has never
  actually been invoked end-to-end.
- `next/font/google` (Inter) was replaced with a system-font stack (see the
  comment in `src/app/layout.tsx`) purely so the production build doesn't
  depend on reaching Google Fonts; swapping it back is a one-line change
  in an environment with normal internet access.
- The Playwright E2E spec (`tests/e2e/happy-path.spec.ts`) and the live
  integration/security Vitest suites are written and reviewed but skip by
  default (see "Verification" above) since they need real network access
  this sandbox doesn't have.

What *has* been verified: the full migration chain, RLS policies, and the
`0007` privilege lockdown against a real local Postgres 16 instance
(stubbed `auth`/`storage` schemas); the demo seed script end-to-end against
that same instance; 82 unit tests; a clean `tsc --noEmit`, a clean
`eslint`, and a clean `next build` producing all 29 routes.
