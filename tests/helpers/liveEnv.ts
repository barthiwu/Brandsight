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

export function randomTestEmail(): string {
  return `brandsight-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
