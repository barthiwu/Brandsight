import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Alert";
import { ScoreBandBadge } from "@/components/ui/Badge";
import { getScoreBand } from "@/lib/scoring/dimensions";

export const metadata = { title: "Audits" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  processing: "Processing",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function AuditsPage() {
  const supabase = await createClient();
  const { data: audits } = await supabase
    .from("audits")
    .select("id, audit_type, status, overall_score, created_at, brands(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-(--color-text)">Audits</h1>
        <Link href="/audits/new">
          <Button>Start a Free Audit</Button>
        </Link>
      </div>

      {audits && audits.length > 0 ? (
        <Card>
          <ul className="divide-y divide-(--color-border)">
            {audits.map((audit) => (
              <li key={audit.id}>
                <Link href={`/audits/${audit.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-(--color-bg) sm:p-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-(--color-text)">
                      {(audit as unknown as { brands: { name: string } | null }).brands?.name ?? "Untitled brand"}
                    </p>
                    <p className="text-xs text-(--color-text-secondary)">
                      {audit.audit_type === "deep" ? "Deep audit" : "Quick audit"} · {new Date(audit.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {audit.status === "completed" && audit.overall_score != null ? (
                    <ScoreBandBadge band={getScoreBand(audit.overall_score)} />
                  ) : (
                    <span className="whitespace-nowrap rounded-full border border-(--color-border) bg-(--color-bg) px-2.5 py-1 text-xs font-medium text-(--color-text-secondary)">
                      {STATUS_LABEL[audit.status] ?? audit.status}
                    </span>
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
  );
}
