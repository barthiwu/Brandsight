"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export interface ShareState {
  error?: string;
  shareToken?: string;
  isActive?: boolean;
}

/** Cryptographically random, unguessable token (spec §67: never predictable IDs). */
function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function enableSharingAction(auditId: string): Promise<ShareState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const rl = await checkRateLimit(`share-generate:${user.id}`, RATE_LIMITS.shareGenerate);
  if (!rl.allowed) return { error: "Too many sharing requests. Please try again shortly." };

  const { data: existing } = await supabase.from("audit_shares").select("*").eq("audit_id", auditId).maybeSingle();

  if (existing) {
    const { error } = await supabase.from("audit_shares").update({ is_active: true }).eq("id", existing.id);
    if (error) return { error: "Could not enable sharing." };
    revalidatePath(`/audits/${auditId}/report`);
    return { shareToken: existing.share_token, isActive: true };
  }

  const token = generateShareToken();
  const { error } = await supabase.from("audit_shares").insert({ audit_id: auditId, share_token: token, is_active: true });
  if (error) return { error: "Could not enable sharing." };

  revalidatePath(`/audits/${auditId}/report`);
  return { shareToken: token, isActive: true };
}

export async function disableSharingAction(auditId: string): Promise<ShareState> {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_shares").update({ is_active: false }).eq("audit_id", auditId);
  if (error) return { error: "Could not disable sharing." };

  revalidatePath(`/audits/${auditId}/report`);
  return { isActive: false };
}
