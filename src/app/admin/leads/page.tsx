import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";
import { LeadStatusSelect } from "./LeadStatusSelect";

export const metadata = { title: "Admin — Leads" };
export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("*, audits(overall_score, brands(name))")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Leads</h1>

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
                <th className="p-3">Consent</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const auditInfo = lead.audits as unknown as { overall_score: number | null; brands: { name: string } | null } | null;
                return (
                  <tr key={lead.id} className="border-b border-(--color-border) last:border-0">
                    <td className="p-3">{lead.business_name ?? auditInfo?.brands?.name ?? "—"}</td>
                    <td className="p-3">{lead.name}</td>
                    <td className="p-3">{lead.email}</td>
                    <td className="p-3">{lead.phone ?? "—"}</td>
                    <td className="p-3">{auditInfo?.overall_score ?? "—"}</td>
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
