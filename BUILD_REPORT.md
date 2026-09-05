# BrandSight V1 — Final Build Report

**Date:** September 5, 2026
**Scope:** Full V1 build in one continuous autonomous pass, per the original spec.

This report is written to the same standard the spec asked for throughout:
say plainly what was built, what was verified and how, and what was not —
never implying something was tested when it wasn't.

## Summary

The complete V1 application was built: ~7,450 lines of application code
across 95 TypeScript/TSX files, 27 routes, a 7-migration Postgres schema
(19 tables, full RLS, two `SECURITY DEFINER` RPCs), a 9-stage AI audit
pipeline, a deterministic scoring engine, PDF generation, public sharing,
lead capture, an admin dashboard, and an automated test suite (82 passing
unit tests, plus integration/security/E2E suites that are written and
reviewed but require live credentials this environment doesn't have).

`tsc --noEmit`, `eslint`, and `next build` all pass cleanly, and the full
database migration chain has been verified against a real (local) Postgres
instance. It has **not** been run against a live Supabase project or a
real OpenAI key, and the source has **not** been pushed to GitHub — both
for reasons outside this session's control, detailed below.

## What was built

All 16 feature areas from the spec are implemented:

1. **Schema & RLS** — 19 tables across 7 migrations (`supabase/migrations/0001`-`0007`), every table owner-scoped via RLS with `EXISTS` subqueries walking the brand → audit → child-table ownership chain.
2. **Auth** — Supabase Auth email/password plus a Google OAuth entry point, session refresh in `src/proxy.ts` (Next 16's renamed middleware), route protection on `/dashboard`, `/brands`, `/audits`, `/settings`, `/admin`.
3. **Brand profiles** — full CRUD (business info, audience, objectives, marketing profile, competitors, social profiles) as the canonical reusable profile.
4. **Audit onboarding** — a config-driven question set (`src/lib/questions/config.ts`) shared by the wizard, autosave, and the AI pipeline's Stage 1 normalization.
5. **Evidence collection** — SSRF-guarded website fetching (`src/lib/evidence/`), Supabase Storage signed uploads for brand assets, competitor and social-profile capture.
6. **Deterministic scoring engine** (`src/lib/scoring/`) — weighted subcriteria, dynamic renormalization over available evidence, confidence heuristics, priority scoring. The AI never invents the numbers; it produces qualitative analysis that this engine turns into scores.
7. **9-stage AI pipeline** (`src/lib/ai/pipeline/`) — OpenAI Responses API with structured/validated outputs; stages 2, 6, and 9 are deterministic application code by design, not AI calls.
8. **Processing state machine** — idempotent locking via a `SECURITY DEFINER` RPC, retry/failure handling.
9. **Dashboard & report UI** — overview, 8 dimension detail pages (one dynamic route), action plan, full report.
10. **PDF generation** — `@react-pdf/renderer`, server-rendered.
11. **Public sharing** — tokenized share links serving curated data via a security-definer RPC.
12. **Lead capture** — explicit consent, owner_id derived server-side (never trusts client input).
13. **Admin dashboard** — audits, leads, users, system monitoring — gated by an email allowlist checked independently in every Server Action (Server Actions don't inherit layout-level auth).
14. **Security hardening** — DB-backed rate limiting on every cost-incurring or abuse-prone action, SSRF protection with redirect-hop re-validation, and a self-caught privilege-escalation fix (see below).
15. **Marketing site & SEO** — landing page, how-it-works, `robots.ts`, `sitemap.ts`, metadata.
16. **Automated tests** — see the dedicated section below.

## A security issue caught and fixed during the build

`try_lock_audit_processing` is a `SECURITY DEFINER` function — it bypasses
RLS to atomically claim an audit row for processing. Postgres grants
EXECUTE on new functions to `PUBLIC` by default, which would have let any
authenticated (or even anonymous) caller flip an arbitrary guessed audit
UUID to `processing`, regardless of ownership. Migration `0007` revokes
that default grant and restricts EXECUTE to `service_role` only. This was
verified directly (see below): both an authenticated non-owner and an
anonymous role get `permission denied for function` when calling it
against a real Postgres instance with the full migration chain applied.

## Verification — what was actually run, and what it showed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean. (Not clean on the first pass — see "Issues found and fixed" below.) |
| `npx eslint .` | Clean. |
| `npx vitest run` | **82 passed**, 12 skipped (gated behind live credentials — see below), 0 failed. |
| `npm run build` (`next build`, Turbopack) | Succeeds — all 27 routes compile, static pages prerender, dynamic routes marked correctly. |
| Full migration chain (`0001`-`0007`) | Applied cleanly against a **real local Postgres 16 instance** with a minimal stand-in `auth`/`storage` schema (this sandbox cannot reach Supabase itself — see below). |
| RLS ownership isolation | Verified directly: as one authenticated user, `select count(*) from brands` returns 1 (their own); switching `auth.uid()` to a different user's id against the same table returns 0. |
| `0007` privilege lockdown | Verified directly: `try_lock_audit_processing` raises `permission denied` for both the `authenticated` and `anon` roles; only `service_role` can call it. |
| Demo seed script (`supabase/seed/northstar_coffee.sql`) | Ran end-to-end against that same local Postgres instance: 1 brand + full sub-profile, 1 completed audit, 17 responses, all 8 dimension scores, 4 findings, 2 correctly-linked recommendations, 1 action plan — all confirmed present with the right shape and content afterward. |

### What this verification does *not* cover

- **No live Supabase project was used.** The local Postgres run stubs
  `auth.users`, `auth.uid()`, and `storage.buckets`/`objects`/`foldername()`
  well enough to apply the schema and exercise RLS/privilege logic, but it
  is not GoTrue, not PostgREST, and not real Supabase Storage. Signup/login
  through the actual Supabase Auth API, PostgREST's own request path, and
  real signed Storage uploads have never been exercised.
- **No OpenAI call has ever been made.** The 9-stage pipeline compiles and
  its schemas/prompts have been reviewed, but Stage 1, 3, 4, 5, 7, and 8
  (the actual LLM calls) have never executed. The demo audit's "AI" content
  in the seed data is hand-written to match the pipeline's output shapes,
  not generated by the model.
- **No dev server was ever started and clicked through.** `next build`
  compiling successfully is a strong signal but is not the same as
  exercising the UI in a browser.
- **The Playwright E2E spec and the live integration/security Vitest
  suites are written and reviewed, not executed** (see `tests/helpers/
  liveEnv.ts` and `playwright.config.ts` for exactly why and how to run
  them once real credentials and network access are available).

## Why: this sandbox's network policy

This build ran in a sandboxed cloud environment whose egress proxy
enforces an organizational allowlist. Three hosts this project needs are
explicitly denied by that policy (confirmed via the proxy's own status
endpoint, `recentRelayFailures`):

- `lveomfoxpiixwnncopoe.supabase.co` (the Supabase project) — 403
- `api.openai.com` — 403
- `fonts.googleapis.com` (next/font/google's Inter fetch) — 403

Per this environment's own instructions, organizational policy denials are
to be reported, not routed around — no alternative HTTP client, no
disabling TLS verification, no bypass was attempted. The Inter font issue
was worked around cleanly (switched to a system-font stack — see the
comment in `src/app/layout.tsx`, a one-line revert once deployed somewhere
that can reach Google Fonts). The Supabase/OpenAI blocks cannot be worked
around from inside this session; they're the reason live verification
stops where the table above says it stops.

## GitHub: not pushed, and why

The task asked for a new "brandsight" repository under your GitHub account
with the source pushed. **This could not be completed from this session.**
A local git repository was initialized and the full source committed
(2 commits on `main`, clean history, no secrets — verified by grepping
every commit for the credential patterns you shared, which only match the
placeholder text in `.env.example`).

Three independent attempts confirm the actual blocker:

1. `GET /repos/barthiwu/brandsight` → *"GitHub access to this repository is
   not enabled for this session."*
2. `POST /user/repos` (create a new repo) → *"sessions are bound to their
   configured repositories"* — repo creation isn't available through this
   session's GitHub access at all.
3. `git push https://github.com/barthiwu/brandsight.git main` → rejected
   by the proxy itself: *"barthiwu/brandsight is not in this session's
   authorized repository set... add the repository to the session's
   sources."*

This session has a GitHub token, but it's scoped to a fixed, pre-approved
set of repositories, and "brandsight" isn't in that set — and there's no
tool available to me, in this session, to add it. That has to happen on
your end (through whatever repo-connection step this product surface uses
before a session starts, or by pushing it yourself). **The complete,
tested source has been packaged and delivered as `brandsight-source.tar.gz`
alongside this report** so nothing is lost while you sort out the GitHub
side. To push it yourself:

```bash
tar xzf brandsight-source.tar.gz -C brandsight
cd brandsight
git remote add origin https://github.com/barthiwu/brandsight.git
git push -u origin main
```

(The archive is a `git archive` of the actual commit history's tree, so
`git log` inside it won't show the 2 commits — if you want the real commit
history too, ask and I'll package a full `.git` bundle instead.)

## Issues found and fixed during verification

The app had never been compiled as a whole before this verification pass
(individual files were written and reasoned about, but no full `tsc`/`next
build` had run). Two categories of real bugs turned up and were fixed:

- **`src/types/database.ts` was missing `Relationships: []` on every table
  and top-level `Views`/`Functions` shape expected by the installed
  `@supabase/postgrest-js`** (the version in use does compile-time select-
  string parsing against the schema type and needs the full `GenericTable`/
  `GenericSchema` shape). Without it, essentially every `.select()` call
  in the app resolved to `never`, producing 220 of the 265 initial
  `tsc` errors. Fixed by adding `Relationships: []` to all 19 tables and
  `Views: Record<string, never>` alongside `Functions`.
- **`plan_30_day`'s type didn't match what Stage 8 actually produces** — it
  was typed as `unknown[]` but the action-plan schema is a structured
  object (`fixFirst`/`week1`-`week4`), not a flat array. Fixed the type;
  the jsonb column itself was always schema-agnostic, so no migration
  change was needed.
- Two admin-page filter inputs (`status`, `type` query params) were passed
  to `.eq()` as raw strings instead of the narrowed enum types — fixed
  with validating helper functions.
- ESLint's `react-hooks/purity` rule flagged `Date.now()` calls made
  directly in a Server Component body — extracted into a plain (non-
  component) async function, which also reads better.
- One unescaped apostrophe (`react/no-unescaped-entities`) and one
  genuinely-unused `@ts-expect-error` directive in a test.

None of these were found by writing code carefully the first time — they
were found by actually running `tsc`, `eslint`, and `next build` against
the whole codebase, which is exactly why that verification pass matters
independent of how carefully each file was written.

## What to do before this goes live

1. **Run the migrations against your real Supabase project** (`supabase db
   push` or `psql` in filename order — see the README) and confirm they
   apply the same way they did locally.
2. **Sanity-check the OpenAI pipeline against a real audit** — the schemas
   and prompts have been reviewed but never executed; watch the first few
   real runs for structured-output validation failures or prompts that
   need tuning.
3. **Run `RUN_LIVE_INTEGRATION_TESTS=1 npm run test` and `RUN_LIVE_E2E_TESTS=1
   npm run test:e2e`** against that real project before considering this
   launch-ready.
4. **Revert `next/font/google`** in `src/app/layout.tsx` once deployed
   somewhere with normal internet access (Vercel, etc.) — trivial, and
   noted inline in the file.
5. Sort out GitHub access for this session (or push the delivered archive
   yourself) so the repository actually exists under your account.
