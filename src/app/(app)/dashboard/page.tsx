import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Alert";
import { ScoreBandBadge } from "@/components/ui/Badge";
import { getScoreBand } from "@/lib/scoring/dimensions";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: brandCount }, { data: audits }, { count: totalAudits }, { count: completedAudits }] =
    await Promise.all([
      supabase.from("brands").select("*", { count: "exact", head: true }),
      supabase
        .from("audits")
        .select("id, audit_type, status, overall_score, created_at, brands(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("audits").select("*", { count: "exact", head: true }),
      supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "completed"),
    ]);

  const firstName = user?.user_metadata?.full_name?.split(" ")?.[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            Here&apos;s what&apos;s happening across your brands.
          </p>
        </div>
        <Link href="/audits/new">
          <Button size="lg">Start a Free Audit</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Brand profiles" value={brandCount ?? 0} />
        <StatCard label="Total audits" value={totalAudits ?? 0} />
        <StatCard label="Completed audits" value={completedAudits ?? 0} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-(--color-text)">Recent audits</h2>
          <Link href="/audits" className="text-sm font-medium text-(--color-blue) hover:underline">
            View all
          </Link>
        </div>
        {audits && audits.length > 0 ? (
          <Card>
            <ul className="divide-y divide-(--color-border)">
              {audits.map((audit) => (
                <li key={audit.id}>
                  <Link
                    href={`/audits/${audit.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 sm:p-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-(--color-text)">
                        {(audit as unknown as { brands: { name: string } | null }).brands?.name ?? "Untitled brand"}
                      </p>
                      <p className="text-xs text-(--color-text-secondary)">
                        {audit.audit_type === "deep" ? "Deep audit" : "Quick audit"} ·{" "}
                        {new Date(audit.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {audit.status === "completed" && audit.overall_score != null ? (
                      <ScoreBandBadge band={getScoreBand(audit.overall_score)} />
                    ) : (
                      <StatusPill status={audit.status} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState
            title="No audits yet"
            description="Run your first free marketing audit to see your BrandSight score."
            action={
              <Link href="/audits/new">
                <Button>Start a Free Audit</Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-(--color-text-secondary)">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-(--color-text)">{value}</p>
      </CardBody>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  processing: "Processing",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-(--color-border) bg-slate-50 px-2.5 py-1 text-xs font-medium text-(--color-text-secondary)">
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
