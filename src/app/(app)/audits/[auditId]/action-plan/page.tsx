import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";

export const dynamic = "force-dynamic";

interface ActionPlanItem {
  title: string;
  whyItMatters: string;
  actionSteps: string[];
  expectedImpact: "low" | "medium" | "high";
  difficulty: "low" | "medium" | "high";
}

interface ActionPlanPageProps {
  params: Promise<{ auditId: string }>;
}

export default async function ActionPlanPage({ params }: ActionPlanPageProps) {
  const { auditId } = await params;
  const supabase = await createClient();

  const { data: audit } = await supabase.from("audits").select("id, status").eq("id", auditId).maybeSingle();
  if (!audit || audit.status !== "completed") notFound();

  const { data: plan } = await supabase.from("audit_action_plans").select("plan_30_day").eq("audit_id", auditId).maybeSingle();
  const plan30 = (plan?.plan_30_day ?? {}) as {
    fixFirst?: ActionPlanItem[];
    week1?: ActionPlanItem[];
    week2?: ActionPlanItem[];
    week3?: ActionPlanItem[];
    week4?: ActionPlanItem[];
  };

  const sections: { key: keyof typeof plan30; label: string }[] = [
    { key: "fixFirst", label: "Fix First" },
    { key: "week1", label: "Week 1" },
    { key: "week2", label: "Week 2" },
    { key: "week3", label: "Week 3" },
    { key: "week4", label: "Week 4" },
  ];

  const hasAnyItems = sections.some((s) => (plan30[s.key]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/audits/${auditId}`} className="text-sm font-medium text-(--color-blue) hover:underline">
          ← Back to overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-(--color-text)">30-Day Action Plan</h1>
      </div>

      {!hasAnyItems ? (
        <EmptyState title="No action plan available for this audit" />
      ) : (
        sections.map(({ key, label }) => {
          const items = plan30[key] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={key}>
              <h2 className="mb-3 text-lg font-semibold text-(--color-text)">{label}</h2>
              <div className="flex flex-col gap-4">
                {items.map((item, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle>{item.title}</CardTitle>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-3">
                      <p className="text-sm text-(--color-text-secondary)">{item.whyItMatters}</p>
                      <ul className="list-inside list-disc text-sm text-(--color-text)">
                        {item.actionSteps.map((step, j) => (
                          <li key={j}>{step}</li>
                        ))}
                      </ul>
                      <div className="flex gap-4 text-xs text-(--color-text-secondary)">
                        <span className="capitalize">Impact: {item.expectedImpact}</span>
                        <span className="capitalize">Difficulty: {item.difficulty}</span>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
