import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { DIMENSION_LABELS } from "@/lib/scoring/dimensions";
import type { DimensionKey } from "@/types/database";

/**
 * Best-effort email notification to the BlitzSMA auditing team whenever a
 * new lead lands, from either funnel:
 *   - "audit_report": someone viewing a report shared via a public link
 *   - "self_audit": the account holder opting in on their own completed
 *     audit's report page
 *
 * Deliberately never throws — a notification failure must never block or
 * fail the lead submission itself, which is the actually-important side
 * effect. Silently a no-op when RESEND_API_KEY / LEAD_NOTIFICATION_EMAIL
 * aren't configured, so this is safe to call in any environment.
 */
export async function notifyNewLead(leadId: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.LEAD_NOTIFICATION_EMAIL;
    if (!apiKey || !toEmail) return;

    const admin = createAdminClient();
    const { data: lead } = await admin
      .from("leads")
      .select("*, audits(audit_type, overall_score, brands(name))")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    const auditInfo = (lead as unknown as {
      audits: { audit_type: "quick" | "deep"; overall_score: number | null; brands: { name: string } | null } | null;
    }).audits;

    const { data: dimensions } = await admin
      .from("audit_dimensions")
      .select("dimension_key, score")
      .eq("audit_id", lead.audit_id)
      .order("score", { ascending: true, nullsFirst: false })
      .limit(3);

    const weakestDimensions = (dimensions ?? [])
      .filter((d) => d.score != null)
      .map((d) => `${DIMENSION_LABELS[d.dimension_key as DimensionKey]} (${d.score}/100)`);

    const resend = new Resend(apiKey);
    const businessName = lead.business_name ?? auditInfo?.brands?.name ?? "Unknown business";
    const sourceLabel = lead.source === "self_audit" ? "Self-audit opt-in" : "Shared report";
    // Resend requires the "from" address's domain to be verified in your
    // Resend account before it can send from it. Until you verify a real
    // domain, LEAD_NOTIFICATION_FROM_EMAIL can stay unset and this falls
    // back to Resend's own onboarding sender, which works immediately.
    const fromEmail = process.env.LEAD_NOTIFICATION_FROM_EMAIL ?? "BrandSight <onboarding@resend.dev>";

    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `New BrandSight lead: ${businessName} (${auditInfo?.overall_score ?? "—"}/100)`,
      text: [
        `New lead from ${sourceLabel}.`,
        "",
        `Business: ${businessName}`,
        `Contact: ${lead.name} <${lead.email}>${lead.phone ? `, ${lead.phone}` : ""}`,
        `Marketing consent: ${lead.consent_marketing ? "Yes" : "No"}`,
        "",
        `Audit type: ${auditInfo?.audit_type ?? "unknown"}`,
        `Overall score: ${auditInfo?.overall_score ?? "N/A"}/100`,
        weakestDimensions.length > 0 ? `Weakest dimensions: ${weakestDimensions.join(", ")}` : "",
        "",
        `Review in the admin dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/leads`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    // Best-effort only — never let a notification failure affect the caller.
  }
}
