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
  // Defense-in-depth (security audit finding): every other mutating
  // action in this file checks auth.getUser() first; this one didn't and
  // relied on RLS alone. RLS (migration 0005) already scopes
  // audit_shares to the audit's owner, so this was never an active IDOR
  // — just a gap worth closing for the same reason as brands.ts's
  // requireOwnedBrand (see its comment): a single point of failure, and
  // a success response even when RLS had silently blocked the write.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: audit } = await supabase.from("audits").select("id").eq("id", auditId).eq("owner_id", user.id).maybeSingle();
  if (!audit) return { error: "Audit not found." };

  const { error } = await supabase.from("audit_shares").update({ is_active: false }).eq("audit_id", auditId);
  if (error) return { error: "Could not disable sharing." };

  revalidatePath(`/audits/${auditId}/report`);
  return { isActive: false };
}
