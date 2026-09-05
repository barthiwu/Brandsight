import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runLiveTests, randomTestEmail } from "../helpers/liveEnv";

/**
 * Live integration test: signup -> profile auto-provisioned by the
 * `handle_new_user` trigger -> sign-in. See tests/helpers/liveEnv.ts for
 * why this is gated behind RUN_LIVE_INTEGRATION_TESTS=1 and has not been
 * executed as part of this build.
 *
 * Uses @supabase/supabase-js directly (not the app's server-only client
 * wrappers) so this file can be safely collected by the test runner even
 * when the suite is skipped — importing "server-only" outside a server
 * context throws unconditionally at module load time.
 */
describe.skipIf(!runLiveTests)("auth flow (live)", () => {
  // Fall back to harmless placeholders when live tests are skipped: this
  // describe callback body still runs at collection time even though the
  // individual `it`s below won't execute, so createClient() must not throw
  // just from being constructed with real env vars absent.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key";
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const email = randomTestEmail();
  const password = "IntegrationTest123!";
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("creates an auth user and an accompanying profile row on signup", async () => {
    const anon = createClient<Database>(url, anonKey);
    const { data, error } = await anon.auth.signUp({ email, password });
    expect(error).toBeNull();
    expect(data.user?.id).toBeTruthy();
    userId = data.user?.id;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", userId!)
      .single();

    expect(profileError).toBeNull();
    expect(profile?.email).toBe(email);
  });

  it("allows signing in with the same credentials", async () => {
    const anon = createClient<Database>(url, anonKey);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
  });

  it("rejects sign-in with the wrong password", async () => {
    const anon = createClient<Database>(url, anonKey);
    const { error } = await anon.auth.signInWithPassword({ email, password: "WrongPassword!" });
    expect(error).not.toBeNull();
  });
});
