import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runLiveTests, randomTestEmail } from "../helpers/liveEnv";

/**
 * Live integration test: a signed-in user can create a brand and an audit
 * for it, and can read/update/delete only their own rows. Gated behind
 * RUN_LIVE_INTEGRATION_TESTS=1 — see tests/helpers/liveEnv.ts.
 */
describe.skipIf(!runLiveTests)("brand + audit CRUD (live)", () => {
  // Fall back to harmless placeholders when live tests are skipped: this
  // describe callback body still runs at collection time even though the
  // individual `it`s below won't execute, so createClient() must not throw
  // just from being constructed with real env vars absent.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key";
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userClient: SupabaseClient<Database>;
  let userId: string;
  let brandId: string;
  let auditId: string;

  beforeAll(async () => {
    const email = randomTestEmail();
    const password = "IntegrationTest123!";
    userClient = createClient<Database>(url, anonKey);
    const { data, error } = await userClient.auth.signUp({ email, password });
    if (error || !data.user) throw error ?? new Error("signup failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("creates a brand owned by the signed-in user", async () => {
    const { data, error } = await userClient
      .from("brands")
      .insert({ owner_id: userId, name: "Northstar Coffee" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    brandId = data!.id;
  });

  it("creates a quick audit for that brand", async () => {
    const { data, error } = await userClient
      .from("audits")
      .insert({ owner_id: userId, brand_id: brandId, audit_type: "quick", status: "draft" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    auditId = data!.id;
  });

  it("lets the owner read their own brand and audit", async () => {
    const { data: brand } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
    const { data: audit } = await userClient.from("audits").select("id").eq("id", auditId).maybeSingle();
    expect(brand?.id).toBe(brandId);
    expect(audit?.id).toBe(auditId);
  });

  it("does not let a different signed-in user see this brand or audit (RLS)", async () => {
    const otherEmail = randomTestEmail();
    const otherClient = createClient<Database>(url, anonKey);
    const { data: otherSignup, error: otherErr } = await otherClient.auth.signUp({
      email: otherEmail,
      password: "IntegrationTest123!",
    });
    expect(otherErr).toBeNull();

    try {
      const { data: brandRows } = await otherClient.from("brands").select("id").eq("id", brandId);
      const { data: auditRows } = await otherClient.from("audits").select("id").eq("id", auditId);
      expect(brandRows ?? []).toHaveLength(0);
      expect(auditRows ?? []).toHaveLength(0);
    } finally {
      if (otherSignup.user) await admin.auth.admin.deleteUser(otherSignup.user.id);
    }
  });

  it("cascades delete of the brand to its audit (audits.brand_id is ON DELETE CASCADE — migration 0001)", async () => {
    const { error } = await userClient.from("brands").delete().eq("id", brandId);
    expect(error).toBeNull();

    const { data: remainingAudit } = await admin.from("audits").select("id").eq("id", auditId).maybeSingle();
    expect(remainingAudit).toBeNull();
  });
});
