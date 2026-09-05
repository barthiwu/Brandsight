import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runLiveTests, randomTestEmail } from "../helpers/liveEnv";

/**
 * Row Level Security regression tests beyond the basic ownership check in
 * tests/integration/brand-audit-crud.test.ts: tables that should be
 * completely unreadable/unwritable by ordinary clients regardless of
 * ownership (rate_limit_events, other users' leads).
 *
 * Gated behind RUN_LIVE_INTEGRATION_TESTS=1 — see tests/helpers/liveEnv.ts.
 * Not executed against a real database as part of this build.
 */
describe.skipIf(!runLiveTests)("RLS policies (live)", () => {
  // See tests/integration/auth-flow.test.ts for why these fall back to
  // placeholders instead of using `!` — the describe body still runs at
  // collection time even when the `it`s inside are skipped.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key";
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const cleanupUserIds: string[] = [];
  afterAll(async () => {
    await Promise.all(cleanupUserIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("does not let an anonymous client read rate_limit_events (internal-only bucket, service_role only)", async () => {
    const anon = createClient<Database>(url, anonKey);
    const { data, error } = await anon.from("rate_limit_events").select("*").limit(1);
    // Either RLS returns zero rows or the query is outright denied — both
    // mean the same thing: no client key exposes rate-limit telemetry.
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("does not let a signed-in user read another user's leads directly", async () => {
    const emailA = randomTestEmail();
    const emailB = randomTestEmail();
    const clientA = createClient<Database>(url, anonKey);
    const clientB = createClient<Database>(url, anonKey);

    const { data: signupA, error: errA } = await clientA.auth.signUp({ email: emailA, password: "IntegrationTest123!" });
    const { data: signupB, error: errB } = await clientB.auth.signUp({ email: emailB, password: "IntegrationTest123!" });
    expect(errA).toBeNull();
    expect(errB).toBeNull();
    cleanupUserIds.push(signupA.user!.id, signupB.user!.id);

    const { data: brand, error: brandErr } = await clientA
      .from("brands")
      .insert({ owner_id: signupA.user!.id, name: "Leads RLS Test Co" })
      .select("id")
      .single();
    expect(brandErr).toBeNull();

    const { data: audit, error: auditErr } = await clientA
      .from("audits")
      .insert({ owner_id: signupA.user!.id, brand_id: brand!.id, audit_type: "quick", status: "completed" })
      .select("id")
      .single();
    expect(auditErr).toBeNull();

    // Leads are inserted via a Server Action using the service role after
    // deriving owner_id server-side, so we simulate that here directly.
    const { error: leadInsertErr } = await admin.from("leads").insert({
      audit_id: audit!.id,
      owner_id: signupA.user!.id,
      name: "Prospective Customer",
      email: "prospect@example.com",
      consent_marketing: true,
    });
    expect(leadInsertErr).toBeNull();

    const { data: leadsSeenByB } = await clientB.from("leads").select("id").eq("audit_id", audit!.id);
    expect(leadsSeenByB ?? []).toHaveLength(0);
  });
});
