import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runLiveTests, randomTestEmail } from "../helpers/liveEnv";

/**
 * Security regression test for the fix in migration 0007
 * (function_privileges): `try_lock_audit_processing` is a SECURITY DEFINER
 * function that flips an audit's status regardless of RLS, so Postgres's
 * default PUBLIC EXECUTE grant would let ANY authenticated (or anonymous)
 * user lock an arbitrary audit UUID they don't own, just by guessing/
 * enumerating it. This test asserts that only the service role can call it.
 *
 * Gated behind RUN_LIVE_INTEGRATION_TESTS=1 — see tests/helpers/liveEnv.ts.
 * This has not been run against a real database as part of this build.
 */
describe.skipIf(!runLiveTests)("function privilege lockdown (live)", () => {
  // See tests/integration/auth-flow.test.ts for why these fall back to
  // placeholders instead of using `!` — the describe body still runs at
  // collection time even when the `it`s inside are skipped.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key";
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userClient: SupabaseClient<Database>;
  let userId: string;

  beforeAll(async () => {
    const email = randomTestEmail();
    userClient = createClient<Database>(url, anonKey);
    const { data, error } = await userClient.auth.signUp({ email, password: "IntegrationTest123!" });
    if (error || !data.user) throw error ?? new Error("signup failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("denies an authenticated (non-owning) user from calling try_lock_audit_processing", async () => {
    const randomAuditId = "00000000-0000-0000-0000-000000000000";
    const { error } = await userClient.rpc("try_lock_audit_processing", { p_audit_id: randomAuditId });
    // Expect a permission-denied error from Postgres (REVOKE EXECUTE), not
    // a successful call and not a silent no-op — the point of the migration
    // is that this call is rejected outright, before RLS is even relevant.
    expect(error).not.toBeNull();
    expect(error?.message?.toLowerCase()).toMatch(/permission denied|not authoriz/);
  });

  it("denies an anonymous (unauthenticated) client the same way", async () => {
    const anon = createClient<Database>(url, anonKey);
    const { error } = await anon.rpc("try_lock_audit_processing", {
      p_audit_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
    expect(error?.message?.toLowerCase()).toMatch(/permission denied|not authoriz/);
  });
});
