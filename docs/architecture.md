# Architecture

This document describes how BrandSight V1 is put together: the request
flow from a business filling in the onboarding wizard to a finished audit
report, the module boundaries, and the reasoning behind the less obvious
structural decisions. For the scoring math and AI pipeline stages
specifically, see `docs/audit-engine.md`. For the threat model and
security controls, see `docs/security.md`.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions, `proxy.ts` middleware)
- **React 19** (`useActionState` for form actions, `useTransition` for
  imperative server-action calls from client components)
- **TypeScript**, **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage) via `@supabase/ssr` (browser/
  server clients that respect the user's session and RLS) and
  `@supabase/supabase-js` (the service-role admin client)
- **OpenAI** Responses API with structured outputs (`zodTextFormat`) for
  the AI audit pipeline, including image and PDF file-input analysis
- **Zod** for all input validation, **Vitest** for unit/integration/
  security tests, **Playwright** for the E2E happy path
- **@react-pdf/renderer** for PDF report generation, **Cheerio** for
  server-side HTML parsing of fetched websites

## Directory map

```
src/
  app/                    Next.js routes (App Router)
    (app)/                Authenticated app shell: dashboard, brands, audits, settings
    admin/                Admin-only pages (server-side allowlist gated)
    api/audits/[id]/process/  The one route handler that kicks off the AI pipeline
    auth/, login/, signup/, forgot-password/, reset-password/  Auth flows
    shared/audit/[shareToken]/  Public, unauthenticated shared report + lead capture
    how-it-works/, page.tsx, etc.  Marketing/SEO pages
  components/             React components, grouped by feature area
  lib/
    actions/              Server Actions (the only way client components mutate data)
    ai/                   OpenAI client wrapper, prompts, the 9-stage pipeline
    evidence/             Website fetcher + SSRF guard
    scoring/              Deterministic scoring engine, dimension config, priority ranking
    security/             Admin allowlist, DB-backed rate limiter
    supabase/             Browser/server/admin Supabase client factories
    questions/            The onboarding question config + readiness validation
    validation/           All Zod schemas
  types/database.ts       Hand-maintained types mirroring the Postgres schema
supabase/
  migrations/             0001-0008, applied in order (see docs/security.md)
  seed/                   Demo data (northstar_coffee.sql)
scripts/verification/     Local-Postgres scripts that verify RLS and the two
                          atomic DB functions against a real database (see its README)
docs/                     This file, security.md, audit-engine.md, final-build-audit.md
tests/
  unit/                   Fast, no external dependencies
  integration/, security/ Gated behind RUN_LIVE_INTEGRATION_TESTS=1 (need real Supabase)
  e2e/                    Gated behind RUN_LIVE_E2E_TESTS=1 (Playwright)
```

## Request flow, end to end

1. **Sign up / sign in** (`src/app/(app)/...`, `src/lib/actions/auth.ts`) —
   Supabase Auth email/password. A `handle_new_user()` trigger
   (migration `0004`) provisions a `profiles` row automatically on signup.
2. **Brand profile** (`src/lib/actions/brands.ts`) — a business's reusable
   profile: name, industry, description, website, competitors, social
   profiles, marketing details. Editable independently of any audit.
3. **Start an audit** (`/audits/new` → `OnboardingWizard`) — picks Quick or
   Deep, then walks through `AUDIT_QUESTIONS`
   (`src/lib/questions/config.ts`), pre-filled from the brand profile where
   the same field exists. Answers are saved incrementally to
   `audit_responses` as the user moves through the wizard, not just at the
   end, so a partially-completed audit survives a closed tab.
4. **Draft → Ready** — `validateAuditReadiness()`
   (`src/lib/questions/validate.ts`) re-checks every required question
   server-side before allowing the transition; the client-side wizard's
   own validation is a UX convenience, not the actual gate.
5. **Ready → Processing** (`POST /api/audits/[auditId]/process`) — the only
   route that invokes the AI pipeline. It re-checks ownership via the
   caller's own RLS-scoped client (never trusts the `auditId` path segment
   alone), rate-limits per user, and then calls the
   `try_lock_audit_processing` SECURITY DEFINER function to atomically
   claim the audit — this is what makes concurrent duplicate-click/retry
   requests safe (see `docs/security.md` and
   `scripts/verification/verify_duplicate_processing_race.mjs`).
6. **The pipeline** (`src/lib/ai/pipeline/runPipeline.ts`) — see
   `docs/audit-engine.md` for the full stage breakdown. Persists dimension
   scores, findings (with evidence citations), recommendations, the
   executive summary, and the 30-day action plan; sets the audit to
   `completed` or `failed`.
7. **Results** — the dashboard overview (`AuditOverview`), eight dimension
   detail pages, the full report page, and PDF export
   (`@react-pdf/renderer`) all read the same persisted rows; nothing is
   recomputed differently between views.
8. **Sharing + lead capture** — an owner can generate a public share link
   (`audit_shares`, `src/lib/actions/sharing.ts`); the public page
   (`/shared/audit/[shareToken]`) resolves the token server-side to an
   audit and never accepts a client-supplied audit ID. A visitor can submit
   their contact details as a lead (`src/lib/actions/leads.ts`), which
   re-derives the audit and its `owner_id` from the same share-token
   resolution chain rather than trusting anything the form posts beyond
   the token itself.
9. **Admin** (`src/app/admin/*`) — an allowlisted set of emails
   (`ADMIN_EMAILS`, checked server-side on every request in
   `admin/layout.tsx`, not just hidden from the nav) can see aggregate
   audit/lead/user/system-health views via the service-role client.

## Key structural decisions

**The AI never invents the score.** The AI pipeline's job is qualitative:
rate subcriteria from evidence, write findings, write recommendations. The
actual numbers — dimension scores, the overall BrandSight score, priority
ranking — are computed by plain, deterministic, unit-tested TypeScript in
`src/lib/scoring/`. This is a hard boundary, not a preference: the AI
output schema for dimension analysis has no field for a rolled-up score,
only per-subcriterion ratings, so there is nothing for a stray model output
to "invent" even if it tried.

**Evidence traceability.** Every finding must be able to point back to
specific evidence, and that evidence must be a real database row — never a
model-hallucinated identifier. The pipeline builds a labeled index of the
real evidence rows it inserted (`"E1"`, `"E2"`, ...), asks the model to
cite labels rather than IDs, and resolves cited labels back to real UUIDs
server-side, silently dropping any label the model invents that isn't in
the index it was actually given (`src/lib/ai/pipeline/evidenceLinking.ts`).

**Honest evidence status.** Every piece of evidence gathered is tagged
`observed` (something was independently fetched/analyzed — a scraped
website, an OpenAI vision read of an uploaded image), `provided` (the
business's own self-reported answer), or `inferred`/`unavailable`. This
distinction feeds directly into per-dimension and overall confidence
scoring (`calculateConfidence` in `src/lib/scoring/engine.ts`) — a report
built entirely from self-reported answers is explicitly marked lower
confidence than one backed by independently observed evidence, and the UI
never implies analysis happened that didn't (see the Quick-vs-Deep and
social-media honesty notes in `docs/audit-engine.md`).

**`server-only` as an architectural fence, not just a lint rule.** Any
module that must never reach the client bundle (the service-role Supabase
client, the rate limiter, the SSRF guard, the website fetcher, the AI
pipeline, the admin allowlist) does `import "server-only"`. Because that
package throws unconditionally outside Next's own bundler, these modules
can't be unit-tested by importing them directly in Vitest — so wherever a
module mixes server-only I/O with pure logic worth testing on its own, the
pure part is split into its own file with no `server-only` import
(`ipRangeCheck.ts` next to `ssrfGuard.ts`; `assetAnalysisSchemas.ts` next
to `assetAnalysis.ts`; `competitorEvidenceFormat.ts` next to
`competitorPipeline.ts`). Where a server-only file's own control flow (not
just a pure helper) needs direct test coverage — the lead-capture
share-token resolution, the admin allowlist, the website fetcher's
redirect handling — the tests mock the `server-only` package itself and
the Supabase admin-client module, so the real logic under test still runs,
just against a fake Postgres/HTTP layer instead of a live one (see
`tests/unit/lead-capture-action.test.ts`, `admin-auth.test.ts`,
`website-fetcher-redirect.test.ts`).

**Brand profile vs. audit responses.** Brand-level data is the canonical,
reusable profile. Starting an audit snapshots the relevant fields into
that audit's own `audit_responses` rows, so a later edit to the brand
profile never retroactively changes a completed audit's report — an audit
is a point-in-time record.

**Idempotent, race-free processing.** Two round trips (a status check then
a status update) would let two concurrent requests for the same audit both
observe "not yet processing" and both start the pipeline. Instead,
`try_lock_audit_processing` does the check-and-claim in one atomic SQL
`UPDATE ... WHERE status IN (...) RETURNING`, which Postgres serializes at
the row level — verified against real concurrent callers in
`scripts/verification/verify_duplicate_processing_race.mjs`, not just
reasoned about.

**Rate limiting is also atomic**, for the same reason: the original
check-then-insert implementation raced under concurrent requests for the
same bucket key. `check_and_record_rate_limit` (migration `0008`) does the
count check and the insert inside one `SECURITY DEFINER` function call,
serialized per bucket key with `pg_advisory_xact_lock`. Verified under 30
concurrent callers in `scripts/verification/verify_rate_limit_race.mjs`.

## What's deliberately out of scope for V1

- **No background job queue.** The AI pipeline runs synchronously inside
  the `process` route handler (`maxDuration = 300`). This is fine for a
  single-region deployment with a generous function timeout; a platform
  with a hard ceiling below a Deep Audit's real runtime would need a queue
  (e.g. a Postgres-backed job table polled by a worker) — documented as a
  known V1 limitation in the README rather than built speculatively.
- **No social-media API integration.** Neither audit type fetches or
  analyzes actual social profile content — the `social` dimension is
  scored from the business's own self-reported answers only, and the UI
  says so explicitly. See `docs/audit-engine.md` for why this was corrected
  during the hardening pass rather than left implied.
- **No crawler.** The website fetcher retrieves exactly the one URL
  supplied, never follows internal links to other pages on the same site.
