# Final build audit — BrandSight V1 hardening pass

This is an independent comparison of the finished repository against the
full BrandSight V1 specification, produced at the end of the post-build
correction and hardening pass. It does not hide remaining limitations —
see "What remains NOT VERIFIABLE LIVE" at the end for the complete list of
things that could not be checked against real external services in this
sandboxed environment, and `docs/security.md` / `docs/audit-engine.md` for
the detailed reasoning behind each area below.

Legend: **PASS** — implemented and verified (by an automated test, a local
Postgres verification script, or direct code inspection against a real
build/typecheck/lint run). **PARTIAL** — implemented but with a known,
documented gap. **FAIL** — not implemented or found broken. **NOT
VERIFIABLE LIVE** — the implementation exists and passed everything
checkable locally, but genuine confirmation requires a live external
service (Supabase network, OpenAI API, a real browser, a real domain) that
this environment cannot reach.

| Area | Status | Notes |
|---|---|---|
| Product (Quick vs. Deep, honest capability claims) | PASS | Both audit types score all 8 dimensions; evidence-gathering steps and UI copy now match actual behavior exactly (§9 in `docs/audit-engine.md`). No feature is advertised that the system doesn't perform. |
| Authentication | NOT VERIFIABLE LIVE | Implementation (Supabase Auth email/password, `handle_new_user()` trigger) is correct by inspection and exercised by `tests/integration/auth-flow.test.ts`, but that suite requires a reachable Supabase project (`RUN_LIVE_INTEGRATION_TESTS=1`) and has never been run against one from this environment. |
| Database schema & migrations | PASS | All 8 migrations applied in order, unmodified, against a real local Postgres 16 instance with a minimal stand-in `auth`/`storage` schema (`scripts/verification/bootstrap_local_db.sh`) — proves the chain works from a clean database, not just against a developer's pre-existing one. |
| Row Level Security | PASS | Enabled on every user-owned table (migration `0005`). 13 scenarios verified against real Postgres in `scripts/verification/verify_rls.mjs`: cross-user SELECT/UPDATE/DELETE denial, forged `owner_id`/`brand_id` rejection, `audit_findings` has no client insert policy at all, `anon` gets zero audit rows, `rate_limit_events` fully deny-all, and cascade-on-delete for both brand and account deletion. |
| Audit engine (dimensions, weights, score bands) | PASS | All subcriteria weights (verified to sum to 1.00 per dimension) and the 8 overall dimension weights (sum to 1.00) match spec exactly; unit tested in `tests/unit/scoring-engine.test.ts`. Every score-band boundary (39/40/59/60/69/70/79/80/89/90/100) individually tested. |
| Confidence calculation | PASS | `calculateConfidence`/`calculateOverallConfidence` implemented per spec (observed/provided/inferred/unavailable mix) and unit tested. |
| AI pipeline (9 stages) | PASS | All 9 stages implemented; dimension-uniqueness validated with `.superRefine()` (exactly 8 keys, no duplicates, no unknowns — not just array length 8); every stage's Zod schema rejects malformed output before it reaches the database. |
| Evidence model | PASS | 4 honest statuses (`observed`/`provided`/`inferred`/`unavailable`); a hardening-pass bug that mislabeled inferred website-visual evidence as `observed` was found and fixed. |
| Evidence traceability | PASS | Findings cite real evidence via a labeled index resolved server-side (`resolveEvidenceRefs`); a model-hallucinated label is silently dropped, never persisted as a fake citation. Unit tested (`tests/unit/evidence-linking.test.ts`) and visible in the dimension/report UI as a disclosure under each finding. |
| Asset analysis | PASS locally / NOT VERIFIABLE LIVE for the actual OpenAI call | Real vision (`input_image`) and file (`input_file`) calls implemented and schema-validated (`tests/unit/asset-analysis.test.ts`); the request shape was confirmed against the OpenAI SDK's own type definitions and compiles cleanly, but no live OpenAI call has actually been executed from this environment (no network egress to `api.openai.com` here). |
| Competitor analysis | PASS locally / NOT VERIFIABLE LIVE for a real fetch | User-provided competitor names always recorded; Deep-audit competitor site fetch reuses the same SSRF-guarded fetcher as the primary website and is unit tested for its evidence-formatting logic (`tests/unit/competitor-evidence.test.ts`); an actual fetch of a real competitor URL has not been executed here (no network egress). |
| Website analysis | PASS locally / NOT VERIFIABLE LIVE for a real fetch | Fetch, SSRF guard, HTML parsing, and redirect-hop re-validation all implemented and unit tested against a mocked `fetch` (`tests/unit/website-fetcher-redirect.test.ts`, `tests/unit/ssrf-guard.test.ts`); an actual outbound request to a real website has not been executed here. |
| Social media analysis | PASS (as a documented non-feature) | No platform API integration exists in V1. This is not a gap being hidden — the UI, onboarding copy, and `docs/audit-engine.md` all say plainly that social content is never analyzed in either audit type; the `social` dimension is scored from self-report only, which is reflected in confidence. |
| Scoring engine determinism | PASS | The AI never outputs a rolled-up score — only per-subcriterion ratings — so there is no code path where a dimension or overall score could be anything other than the deterministic computation in `src/lib/scoring/engine.ts`. |
| Priority engine | PASS | Impact/severity/difficulty formula implemented; ties verified to break via stable-sort (original order preserved), not an arbitrary reshuffle (`tests/unit/priority.test.ts`). |
| Recommendations & action plan | PASS | Every recommendation is generated from specific findings (never a bare "post more"); the action plan is explicitly instructed never to invent an item outside the ranked recommendations it was given. |
| Reports & PDF | PASS locally / NOT VERIFIABLE LIVE for rendered PDF byte-for-byte review | Report page reads the same persisted rows as every other view (no hard-coded demo data in the production path); PDF generation code compiles and builds cleanly, but visual PDF output (page breaks, overflow with very long content) has not been manually reviewed against a rendered file in this environment. |
| Public sharing | PASS | Token-based, private by default, revocable (`is_active`), optional expiry; the public page and lead capture both resolve the token server-side and never accept a client-supplied audit ID. Revoked/expired/unknown-token rejection unit tested. |
| Lead capture | PASS | Consent is an explicit unchecked-by-default checkbox, timestamped only when given; `owner_id` always server-derived from the resolved audit, never client input; forged/dangling audit-ID and non-completed-audit rejection unit tested (`tests/unit/lead-capture-action.test.ts`). |
| Admin | PASS | Server-side email allowlist checked on every `/admin/*` request (not just hidden nav), fails closed on a missing/empty allowlist; unit tested (`tests/unit/admin-auth.test.ts`). A misleading "rate-limited actions" stat label (it actually only ever counts allowed/throttle-tracked actions, since a blocked call never gets a row) was found and corrected. |
| SSRF protection | PASS | Scheme allowlist, loopback/private/reserved/link-local blocking, IPv4-mapped-IPv6 unwrapping, NAT64/6to4 fail-closed handling, and per-redirect-hop re-validation — all unit tested, including a "malicious redirect to cloud metadata / private IP / localhost" scenario against a mocked `fetch`. |
| File upload security | PASS | MIME allowlist + 10 MB cap enforced both at the application layer (Zod schema) and the storage-bucket layer (defense in depth); filenames sanitized and UUID-prefixed against path traversal/collision; audit type/status (Deep + draft only) enforced server-side, not just hidden in the UI. |
| Storage access policies | PASS | Owner-prefix RLS policies on `storage.objects`; the public shared-report page never has any access to storage paths, only to already-persisted analysis text. |
| Rate limiting | PASS | Every AI-cost-incurring/abuse-prone action limited; the original check-then-insert race was found and fixed with a single atomic `SECURITY DEFINER` function using `pg_advisory_xact_lock`, verified under 30 concurrent callers holding exactly the configured limit (`scripts/verification/verify_rate_limit_race.mjs`). Documented deliberate fail-open-on-infra-error behavior. |
| Duplicate/concurrent audit processing | PASS | Single atomic `UPDATE ... WHERE status IN (...) RETURNING` lock, verified under 25 concurrent callers (exactly one wins) plus every non-eligible status correctly refused (`scripts/verification/verify_duplicate_processing_race.mjs`). |
| Prompt injection defense | PASS | All external content wrapped and labeled as untrusted; a real tag-forging vulnerability (unescaped `<`/`>` letting scraped content fake a closing `EXTERNAL_DATA` tag) was found and fixed with HTML-style escaping, unit tested including the exact forged-tag attack shape. |
| Authorization (no client-trusted identity) | PASS | Audited every server action and route handler; none accept `owner_id`/`user_id`/role/admin-flag from the client — identity always comes from the session, ownership always re-checked via the caller's own RLS-scoped client before any service-role write. |
| Audit state machine | PASS | `draft → ready` gated by server-side `validateAuditReadiness()`; `ready/failed → processing` gated by the atomic lock function, which structurally cannot be invoked from `completed`, `draft`, `cancelled`, or already-`processing` states. |
| Data deletion (brand/audit/account) | PASS | All three flows implemented (none existed as reachable features before this pass — the brand-delete server action existed but had no UI, and account deletion didn't exist at all); each removes its own Storage objects before the corresponding DB cascade, verified against real Postgres cascade behavior. |
| Error handling | PASS | Server actions and routes return fixed friendly messages to the client; actual errors (including anything from Supabase/OpenAI) are `console.error`-logged server-side only, never serialized into a response. |
| Environment & secret hygiene | PASS | Repository-wide scan for API-key/token/JWT-shaped strings found nothing outside `.env.example` (which contains only placeholder values); `.env.local` is git-ignored and confirmed untracked (`git check-ignore`); the service-role Supabase client is `server-only`-guarded. |
| UI completeness | PASS | No TODO/"coming soon"/placeholder-card markers found in the reviewed routes; the two previously-dead-end states found during this pass (a cancelled audit with no action, a brand/account with no delete path) were given real actions rather than left as gaps. |
| Test suite | PASS | 154 unit tests passing (13 files, 0 failing), covering scoring, weighting, confidence, priority + tie-breaking, the audit-readiness state gate, SSRF/IP classification, prompt-injection escaping, asset-analysis schemas, competitor-evidence formatting, evidence-linking/citation resolution, the lead-capture share-token resolution chain, the admin allowlist, and website-fetcher redirect/SSRF handling. 12 additional integration/security tests exist and are correctly gated behind `RUN_LIVE_INTEGRATION_TESTS=1` (they need a reachable Supabase project) — they are written and reviewed but have not been executed live from this environment. `tests/e2e/happy-path.spec.ts` exists and is gated behind `RUN_LIVE_E2E_TESTS=1` for the same reason. |
| Documentation | PASS | `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/audit-engine.md`, and this file all written/updated during this pass; `scripts/verification/README.md` documents the local-Postgres verification scripts. |
| Build / TypeScript / Lint | PASS | `tsc --noEmit` clean, `eslint .` clean, `next build` produces all 29 routes with no errors, all run at the end of this pass (not just at some earlier point in development). |

## What remains NOT VERIFIABLE LIVE

This sandboxed environment has no outbound network access to
`supabase.co`, `api.openai.com`, or the public internet generally. As a
direct, unavoidable consequence, the following have never actually been
executed here, even though the corresponding code is implemented, code
reviewed, and (where the logic can be isolated from the live network call)
unit tested against a realistic mock:

- **Live Supabase Auth**: no real signup/login/password-reset has ever
  round-tripped through the actual Supabase Auth/PostgREST stack.
- **Live Supabase database access through the real API**: the schema, RLS
  policies, and both atomic functions have been verified against a real
  local Postgres 16 instance with the project's actual migration files
  applied unmodified — but not against the actual hosted Supabase project,
  which layers PostgREST, connection pooling, and its own auth schema
  implementation on top of plain Postgres.
- **Live OpenAI calls**: every pipeline stage's request construction
  compiles against the OpenAI SDK's real types and its schema validation
  is unit tested, but no actual API call (dimension analysis, findings,
  recommendations, asset vision/file analysis, executive summary, action
  plan) has been made. Model behavior — output quality, latency, actual
  error shapes on rate-limit/timeout — is unverified.
- **Live outbound website/competitor fetches**: the fetcher, SSRF guard,
  and HTML parser are unit tested against a mocked `fetch`, but no real
  HTTP request to an external website has been made from this
  environment.
- **Production Storage**: signed-upload-URL generation and asset download
  code is implemented and type-checks, but no file has actually been
  uploaded to or downloaded from a real Supabase Storage bucket.
- **Production PDF rendering**: `@react-pdf/renderer` output compiles, but
  a generated PDF has not been visually reviewed for real audit data,
  including edge cases like very long business names or many findings.
- **The Playwright E2E happy-path spec**: written and reviewed, requires a
  running app plus real Supabase/OpenAI credentials
  (`RUN_LIVE_E2E_TESTS=1`); not executed here.
- **Actual production deployment**: no live domain, no production build
  has been deployed anywhere; `next build` succeeding locally is not the
  same as a verified production deployment.

None of the above is being claimed as tested when it was not. Running the
live-gated integration/security/E2E suites (`RUN_LIVE_INTEGRATION_TESTS=1`,
`RUN_LIVE_E2E_TESTS=1`) against the real Supabase project and a real
OpenAI key, plus one full manual walkthrough of a real audit end to end, is
the specific, concrete next step before this build should be considered
launch-verified — this is exactly what "the next stage is formal
BrandSight testing" (not another development cycle) should consist of.
