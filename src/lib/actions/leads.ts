"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { leadCaptureSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export interface LeadActionState {
  error?: string;
  success?: boolean;
}

/**
 * Lead capture (spec §68-69, hardening pass §5). The ONLY input that
 * identifies which audit a lead is for is the public share token — never
 * a client-supplied audit_id. The full server-side resolution chain is:
 *
 *   share_token -> active, non-expired audit_shares row -> audit
 *     -> audit must be completed -> owner_id read from that row
 *
 * A client can never name an arbitrary audit UUID directly, and owner_id
 * is never accepted from the client at any point. This intentionally
 * means lead capture only works from the public shared report — an
 * audit's own owner isn't a "lead" for their own business, so this form
 * does not appear on the authenticated report page (see
 * src/app/(app)/audits/[auditId]/report/page.tsx).
 */
export async function submitLeadAction(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const parsed = leadCaptureSchema.safeParse({
    share_token: formData.get("share_token"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    business_name: formData.get("business_name") ?? "",
    consent_marketing: formData.get("consent_marketing") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  const rl = await checkRateLimit(`lead-submit:${parsed.data.email.toLowerCase()}`, RATE_LIMITS.leadSubmit);
  if (!rl.allowed) return { error: "Too many submissions. Please try again later." };

  const admin = createAdminClient();

  const { data: share } = await admin
    .from("audit_shares")
    .select("audit_id, is_active, expires_at")
    .eq("share_token", parsed.data.share_token)
    .maybeSingle();

  if (!share || !share.is_active || (share.expires_at && new Date(share.expires_at) < new Date())) {
    return { error: "This shared report is no longer available." };
  }

  const { data: audit } = await admin
    .from("audits")
    .select("id, owner_id, status")
    .eq("id", share.audit_id)
    .maybeSingle();

  if (!audit || audit.status !== "completed") {
    return { error: "This audit is not available for lead capture." };
  }

  const { error } = await admin.from("leads").insert({
    audit_id: audit.id,
    owner_id: audit.owner_id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    business_name: parsed.data.business_name || null,
    consent_marketing: parsed.data.consent_marketing,
    consent_timestamp: parsed.data.consent_marketing ? new Date().toISOString() : null,
    source: "audit_report",
    status: "new",
  });

  if (error) return { error: "Could not submit. Please try again." };

  return { success: true };
}
