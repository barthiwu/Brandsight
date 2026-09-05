import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardBody } from "@/components/ui/Card";

export const metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createAdminClient();

  const [
    { count: totalUsers },
    { count: totalBrands },
    { count: auditsStarted },
    { count: auditsCompleted },
    { count: auditsFailed },
    { count: totalLeads },
    { count: convertedLeads },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("brands").select("*", { count: "exact", head: true }),
    supabase.from("audits").select("*", { count: "exact", head: true }),
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "converted"),
  ]);

  const completionRate = auditsStarted ? Math.round(((auditsCompleted ?? 0) / auditsStarted) * 100) : 0;
  const conversionRate = totalLeads ? Math.round(((convertedLeads ?? 0) / totalLeads) * 100) : 0;

  const stats = [
    { label: "Total users", value: totalUsers ?? 0 },
    { label: "Total brands", value: totalBrands ?? 0 },
    { label: "Audits started", value: auditsStarted ?? 0 },
    { label: "Audits completed", value: auditsCompleted ?? 0 },
    { label: "Completion rate", value: `${completionRate}%` },
    { label: "Failed audits", value: auditsFailed ?? 0 },
    { label: "Leads", value: totalLeads ?? 0 },
    { label: "Lead conversion", value: `${conversionRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Admin overview</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-xs text-(--color-text-secondary)">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-(--color-text)">{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
