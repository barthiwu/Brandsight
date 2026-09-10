import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";
import { LeadStatusSelect } from "./LeadStatusSelect";
import { DIMENSION_LABELS } from "@/lib/scoring/dimensions";
import type { DimensionKey } from "@/types/database";

export const metadata = { title: "Admin — Leads" };
export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();

  // Weakest score first (fit signal, per BlitzSMA funnel decision): a low
  // score is the clearest "this business needs help" signal for the
  // auditing team to triage against. Nulls (not-yet-scored/edge-case
  // audits) sort last rather than first.
  const { data: leads } = await supabase
    .from("leads")
    .select("*, audits(audit_type, overall_score, brands(name))")
    .order("overall_score", { ascending: true, nullsFirst: false, foreignTable: "audits" })
    .limit(200);

  const auditIds = Array.from(new Set((leads ?? []).map((l) => l.audit_id)));
  const { data: allDimensions } = auditIds.length
    ? await supabase.from("audit_dimensions").select("audit_id, dimension_key, score").in("audit_id", auditIds)
    : { data: [] as { audit_id: string; dimension_key: DimensionKey; score: number | null }[] };

  // Weakest dimension per audit — computed here rather than via a second
  // per-lead query, so the whole page stays at two queries regardless of
  // how many leads are shown.
  const weakestByAudit = new Map<string, { key: DimensionKey; score: number }>();
  for (const d of allDimensions ?? []) {
    if (d.score == null) continue;
    const current = weakestByAudit.get(d.audit_id);
    if (!current || d.score < current.score) weakestByAudit.set(d.audit_id, { key: d.dimension_key, score: d.score });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Leads</h1>
      <p className="text-sm text-(--color-text-secondary)">
        Sorted by weakest overall score first — the clearest signal of which prospects most need BlitzSMA&apos;s help.
      </p>

      {leads && leads.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-(--color-border) text-xs uppercase text-(--color-text-secondary)">
              <tr>
                <th className="p-3">Business</th>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Score</th>
                <th className="p-3">Audit type</th>
                <th className="p-3">Weakest dimension</th>
                <th className="p-3">Source</th>
                <th className="p-3">Consent</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const auditInfo = lead.audits as unknown as {
                  audit_type: "quick" | "deep" | null;
                  overall_score: number | null;
                  brands: { name: string } | null;
                } | null;
                const weakest = weakestByAudit.get(lead.audit_id);
                return (
                  <tr key={lead.id} className="border-b border-(--color-border) last:border-0">
                    <td className="p-3">{lead.business_name ?? auditInfo?.brands?.name ?? "—"}</td>
                    <td className="p-3">{lead.name}</td>
                    <td className="p-3">{lead.email}</td>
                    <td className="p-3">{lead.phone ?? "—"}</td>
                    <td className="p-3">{auditInfo?.overall_score ?? "—"}</td>
                    <td className="p-3 capitalize">{auditInfo?.audit_type ?? "—"}</td>
                    <td className="p-3">{weakest ? `${DIMENSION_LABELS[weakest.key]} (${weakest.score})` : "—"}</td>
                    <td className="p-3">{lead.source === "self_audit" ? "Self-audit" : "Shared report"}</td>
                    <td className="p-3">{lead.consent_marketing ? "Yes" : "No"}</td>
                    <td className="p-3">
                      <LeadStatusSelect leadId={lead.id} status={lead.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="No leads yet" />
      )}
    </div>
  );
}
