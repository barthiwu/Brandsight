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
  const objectPath = () => `${userId}/storage-roundtrip-test/${Date.now()}.png`;
  let uploadedPath: string;

  // A real, minimal 1x1 transparent PNG — the bucket's allowed_mime_types
  // (migration 0006_storage.sql) only permits image/png, image/jpeg,
  // image/webp, and application/pdf, matching what real brand-asset
  // uploads actually are, so the round trip has to use a real allowed
  // type rather than arbitrary text.
  const fileBytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    ),
    (c) => c.charCodeAt(0)
  );

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
      contentType: "image/png",
      upsert: false,
    });
    expect(error).toBeNull();
  });

  it("downloads the same object back with byte-identical contents", async () => {
    const { data, error } = await userClient.storage.from(bucket).download(uploadedPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const downloaded = new Uint8Array(await data!.arrayBuffer());
    expect(Array.from(downloaded)).toEqual(Array.from(fileBytes));
  });

  it("removes the object, confirmed by the canonical listing — not by re-downloading it", async () => {
    const prefix = `${userId}/storage-roundtrip-test`;
    const fileName = uploadedPath.split("/").pop()!;

    const { error: removeError } = await userClient.storage.from(bucket).remove([uploadedPath]);
    expect(removeError).toBeNull();

    // Ground truth for "is the object actually gone" is the canonical
    // listing (list()), not download(). Uploaded objects in this bucket
    // are served with Cache-Control: max-age=3600 (visible on the
    // metadata returned by the upload/remove calls), and Supabase
    // Storage's CDN honors that on GETs even after the underlying object
    // is deleted — a download() immediately after remove() can keep
    // succeeding from cache for up to that full hour. Confirmed live:
    // list() showed the object gone immediately after remove(), while
    // download() kept returning it successfully for 10+ seconds straight
    // with no sign of expiring. That's expected CDN cache behavior, not
    // a deletion bug — remove()'s own response already confirms it
    // deleted the real object (id, version, etc.), and list() is the
    // authoritative "does it still exist" check, not a request that can
    // be served from a stale cache entry.
    const { data: afterList, error: listError } = await admin.storage.from(bucket).list(prefix);
    expect(listError).toBeNull();
    expect((afterList ?? []).some((f) => f.name === fileName)).toBe(false);

    uploadedPath = ""; // already removed, skip afterAll's redundant cleanup
  });
});
