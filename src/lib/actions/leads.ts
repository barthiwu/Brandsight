"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leadCaptureSchema, selfAuditLeadCaptureSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { notifyNewLead } from "@/lib/notifications/leadNotification";

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

  // Generated up front (rather than reading the id back via .select()
  // after insert) so a plain insert() call is enough here — keeps this
  // action's use of the query builder to exactly the subset the unit
  // tests' fake admin client stands in for.
  const leadId = randomUUID();
  const { error } = await admin.from("leads").insert({
    id: leadId,
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

  void notifyNewLead(leadId);

  return { success: true };
}

/**
 * Self-audit lead capture (BlitzSMA funnel): the account holder opting in
 * to be contacted about their OWN just-completed audit, from the
 * authenticated report page. Unlike submitLeadAction, the audit is
 * resolved through the signed-in user's own session and ownership is
 * enforced server-side (owner_id === the authenticated user, status ===
 * "completed") — a client can request notification about an audit_id
 * that isn't theirs, but the insert will simply be refused.
 *
 * Idempotent: if a self_audit lead already exists for this audit, returns
 * success without inserting a duplicate (so a repeat click/submit, e.g.
 * from a slow network retry, doesn't spam the team with duplicates).
 */
export async function submitSelfAuditLeadAction(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const parsed = selfAuditLeadCaptureSchema.safeParse({
    audit_id: formData.get("audit_id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    business_name: formData.get("business_name") ?? "",
    consent_marketing: formData.get("consent_marketing") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const rl = await checkRateLimit(`self-audit-lead-submit:${user.id}`, RATE_LIMITS.leadSubmit);
  if (!rl.allowed) return { error: "Too many submissions. Please try again later." };

  const admin = createAdminClient();

  const { data: audit } = await admin
    .from("audits")
    .select("id, owner_id, status")
    .eq("id", parsed.data.audit_id)
    .maybeSingle();

  if (!audit || audit.owner_id !== user.id) return { error: "Audit not found." };
  if (audit.status !== "completed") return { error: "This audit isn't complete yet." };

  const { data: existing } = await admin
    .from("leads")
    .select("id")
    .eq("audit_id", audit.id)
    .eq("source", "self_audit")
    .maybeSingle();

  if (existing) return { success: true };

  const leadId = randomUUID();
  const { error } = await admin.from("leads").insert({
    id: leadId,
    audit_id: audit.id,
    owner_id: audit.owner_id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    business_name: parsed.data.business_name || null,
    consent_marketing: parsed.data.consent_marketing,
    consent_timestamp: parsed.data.consent_marketing ? new Date().toISOString() : null,
    source: "self_audit",
    status: "new",
  });

  if (error) return { error: "Could not submit. Please try again." };

  void notifyNewLead(leadId);

  return { success: true };
}
