import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runLiveTests, randomTestEmail } from "../helpers/liveEnv";

/**
 * Live integration test: a real upload/download/remove round trip against
 * the real Supabase Storage bucket used for brand assets. The Deep Audit
 * E2E spec exercises Storage incidentally (via the wizard's upload UI and
 * the AI pipeline's asset analysis), but nothing asserts on Storage
 * directly — this is that dedicated check.
 *
 * Mirrors the app's own upload path (src/lib/actions/assets.ts): a real
 * user gets a signed upload URL for BUCKET/<userId>/<random>-<name>, the
 * anon client uploads real bytes to it, then downloads them back and
 * confirms they're byte-identical, before cleanup removes the object.
 *
 * Gated behind RUN_LIVE_INTEGRATION_TESTS=1 — see tests/helpers/liveEnv.ts.
 */
describe.skipIf(!runLiveTests)("Storage upload/download round trip (live)", () => {
  // See tests/integration/auth-flow.test.ts for why these fall back to
  // placeholders instead of using `!` — the describe body still runs at
  // collection time even when the `it`s inside are skipped.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key";
  const bucket = process.env.STORAGE_BUCKET_NAME ?? "brand-assets";
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userClient: SupabaseClient<Database>;
  let userId: string;
  const objectPath = () => `${userId}/storage-roundtrip-test/${Date.now()}.txt`;
  let uploadedPath: string;

  const fileContents = `BrandSight live storage round-trip check — ${new Date().toISOString()}`;
  const fileBytes = new TextEncoder().encode(fileContents);

  beforeAll(async () => {
    const email = randomTestEmail();
    const password = "IntegrationTest123!";
    userClient = createClient<Database>(url, anonKey);
    const { data, error } = await userClient.auth.signUp({ email, password });
    if (error || !data.user) throw error ?? new Error("signup failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (uploadedPath) await admin.storage.from(bucket).remove([uploadedPath]);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("uploads a real object to Storage as the signed-in user", async () => {
    uploadedPath = objectPath();
    const { error } = await userClient.storage.from(bucket).upload(uploadedPath, fileBytes, {
      contentType: "text/plain",
      upsert: false,
    });
    expect(error).toBeNull();
  });

  it("downloads the same object back with byte-identical contents", async () => {
    const { data, error } = await userClient.storage.from(bucket).download(uploadedPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const downloaded = new Uint8Array(await data!.arrayBuffer());
    expect(new TextDecoder().decode(downloaded)).toBe(fileContents);
  });

  it("removes the object, and a subsequent download fails", async () => {
    const { error: removeError } = await userClient.storage.from(bucket).remove([uploadedPath]);
    expect(removeError).toBeNull();

    const { error: downloadError } = await userClient.storage.from(bucket).download(uploadedPath);
    expect(downloadError).not.toBeNull();
    uploadedPath = ""; // already removed, skip afterAll's redundant cleanup
  });
});
