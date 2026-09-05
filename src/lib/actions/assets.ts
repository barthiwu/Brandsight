"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { assetUploadMetaSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

const BUCKET = process.env.STORAGE_BUCKET_NAME ?? "brand-assets";

export interface RequestUploadResult {
  ok: boolean;
  error?: string;
  assetId?: string;
  path?: string;
  token?: string;
}

/**
 * Issues a short-lived signed upload URL/token for a brand asset (spec
 * §56, §26). The browser uploads the bytes directly to Supabase Storage
 * with the returned token — file contents never pass through our server.
 * A pending `audit_assets` row is created up front so the record exists
 * even if the client-side upload never completes (visible to the owner
 * as `analysis_status: pending`, harmless if orphaned).
 */
export async function requestAssetUploadAction(
  auditId: string,
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<RequestUploadResult> {
  const parsed = assetUploadMetaSchema.safeParse({ audit_id: auditId, file_name: fileName, mime_type: mimeType, file_size: fileSize });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const rl = await checkRateLimit(`asset-upload:${user.id}`, RATE_LIMITS.assetUpload);
  if (!rl.allowed) return { ok: false, error: "Too many uploads. Please try again later." };

  // Ownership check happens implicitly via RLS on the insert below (the
  // audit must belong to this user for the row to be accepted).
  const safeName = parsed.data.file_name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
  const path = `${user.id}/${auditId}/${randomUUID()}-${safeName}`;

  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) return { ok: false, error: "Could not prepare upload." };

  const { data: assetRow, error: insertError } = await supabase
    .from("audit_assets")
    .insert({
      audit_id: auditId,
      owner_id: user.id,
      file_name: parsed.data.file_name,
      storage_path: path,
      mime_type: parsed.data.mime_type,
      file_size: parsed.data.file_size,
      asset_type: "brand_asset",
      analysis_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !assetRow) return { ok: false, error: "Could not record upload." };

  return { ok: true, assetId: assetRow.id, path: signed.path, token: signed.token };
}

export async function deleteAssetAction(assetId: string) {
  const supabase = await createClient();
  const { data: asset } = await supabase.from("audit_assets").select("storage_path").eq("id", assetId).maybeSingle();
  if (asset) {
    await supabase.storage.from(BUCKET).remove([asset.storage_path]);
    await supabase.from("audit_assets").delete().eq("id", assetId);
  }
}
