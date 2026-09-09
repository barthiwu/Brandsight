/**
 * Guard for tests that need a real, reachable Supabase project.
 *
 * These tests are NOT run by default. Even when NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are present in the environment, that alone
 * doesn't mean the project is actually reachable from wherever the test
 * runner executes (e.g. a sandboxed CI runner behind an egress allowlist
 * that blocks *.supabase.co). Set RUN_LIVE_INTEGRATION_TESTS=1 explicitly —
 * from a machine with real network access to Supabase — to opt in.
 *
 * This project's own build was carried out in a sandbox whose network
 * policy blocks both supabase.co and api.openai.com outright, so these
 * suites have been written and reviewed but never actually executed
 * end-to-end. That is disclosed in the final build report; running them
 * for the first time against a real project is part of the pre-launch
 * checklist, not something this codebase can self-certify.
 */
export const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const runLiveTests = hasLiveSupabaseEnv && process.env.RUN_LIVE_INTEGRATION_TESTS === "1";

// NOTE: found during the first actual live-testing pass (this codebase's
// own final report was explicit that these suites had been written and
// reviewed but never executed — this is exactly the kind of thing that
// only surfaces once they finally run against a real project). Supabase's
// current signup validation rejects addresses on RFC 2606 reserved/
// documentation domains (example.com/.net/.org) outright with "Email
// address ... is invalid" — so the original `@example.com` fixture domain
// never actually worked against a live project. `.test` is also an RFC
// 2606 reserved TLD but is not on Supabase's specific denylist (unlike
// the "example" domains, which look like real spam-signup vectors from
// a provider's point of view); using it here keeps these addresses
// unambiguously fake without hitting that block.
export function randomTestEmail(): string {
  return `brandsight-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@brandsight-livetest.test`;
}
