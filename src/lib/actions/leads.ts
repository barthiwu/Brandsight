"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { leadCaptureSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export interface LeadActionState {
  error?: string;
  success?: boolean;
}

/**
 * Lead capture (spec §68-69). Always runs server-side with the admin
 * client and derives `owner_id` from the audit record itself — never
 * from client input — so this works identically whether the visitor is
 * the authenticated audit owner or an anonymous visitor on a public
 * share link, and a client can never forge whose lead inbox it lands in.
 */
export async function submitLeadAction(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const parsed = leadCaptureSchema.safeParse({
    audit_id: formData.get("audit_id"),
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
  const { data: audit } = await admin.from("audits").select("id, owner_id, status").eq("id", parsed.data.audit_id).maybeSingle();
  if (!audit || audit.status !== "completed") {
    return { error: "This audit is not available for lead capture." };
  }

  const { error } = await admin.from("leads").insert({
    audit_id: parsed.data.audit_id,
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
