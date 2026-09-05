import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FindingTypeBadge } from "@/components/ui/Badge";
import { ScoreDisplay } from "./ScoreDisplay";
import { DimensionCard } from "./DimensionCard";
import { ALL_DIMENSION_KEYS, DIMENSION_LABELS, getScoreBand } from "@/lib/scoring/dimensions";
import { rankByPriority } from "@/lib/scoring/priority";
import type { DimensionKey } from "@/types/database";

export async function AuditOverview({ auditId }: { auditId: string }) {
  const supabase = await createClient();

  const [{ data: audit }, { data: dimensions }, { data: findings }, { data: recommendations }, { data: brand }] =
    await Promise.all([
      supabase.from("audits").select("*").eq("id", auditId).single(),
      supabase.from("audit_dimensions").select("*").eq("audit_id", auditId),
      supabase.from("audit_findings").select("*").eq("audit_id", auditId),
      supabase.from("audit_recommendations").select("*").eq("audit_id", auditId),
      supabase.from("audits").select("brands(name)").eq("id", auditId).single(),
    ]);

  if (!audit) return null;

  const dimensionByKey = new Map((dimensions ?? []).map((d) => [d.dimension_key, d]));
  const strengths = (findings ?? []).filter((f) => f.type === "strength");
  const weaknesses = (findings ?? []).filter((f) => f.type === "weakness");
  const topRecommendations = rankByPriority(recommendations ?? []).slice(0, 5);
  const brandName = (brand as unknown as { brands: { name: string } | null } | null)?.brands?.name;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{brandName ?? "Audit"} — Results</h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            {audit.audit_type === "deep" ? "Deep audit" : "Quick audit"} · Completed{" "}
            {audit.completed_at ? new Date(audit.completed_at).toLocaleDateString() : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/audits/${auditId}/report`}>
            <Button>View full report</Button>
          </Link>
        </div>
      </div>

      <ScoreDisplay
        score={audit.overall_score}
        band={audit.overall_score != null ? getScoreBand(audit.overall_score) : null}
        confidence={audit.overall_confidence ?? undefined}
      />

      {audit.executive_summary && (
        <Card>
          <CardHeader>
            <CardTitle>Executive summary</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm leading-relaxed text-(--color-text)">{audit.executive_summary}</p>
          </CardBody>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-(--color-text)">Dimension scores</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ALL_DIMENSION_KEYS.map((key: DimensionKey) => {
            const d = dimensionByKey.get(key);
            return (
              <DimensionCard
                key={key}
                auditId={auditId}
                dimensionKey={key}
                label={DIMENSION_LABELS[key]}
                score={d?.score ?? null}
                confidence={d?.confidence ?? "low"}
              />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s working</CardTitle>
          </CardHeader>
          <CardBody>
            {strengths.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {strengths.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <FindingTypeBadge type={f.type} />
                      <span className="font-medium text-(--color-text)">{f.title}</span>
                    </div>
                    <p className="text-sm text-(--color-text-secondary)">{f.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-(--color-text-secondary)">No clear strengths identified from the evidence available.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What needs attention</CardTitle>
          </CardHeader>
          <CardBody>
            {weaknesses.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {weaknesses.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <FindingTypeBadge type={f.type} />
                      <span className="font-medium text-(--color-text)">{f.title}</span>
                    </div>
                    <p className="text-sm text-(--color-text-secondary)">{f.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-(--color-text-secondary)">No significant weaknesses identified.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Priority actions</CardTitle>
        </CardHeader>
        <CardBody>
          {topRecommendations.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {topRecommendations.map((r, i) => (
                <li key={r.id} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--color-blue) text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-(--color-text)">{r.title}</p>
                    <p className="text-sm text-(--color-text-secondary)">{r.why_it_matters}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-(--color-text-secondary)">No recommendations were generated.</p>
          )}
        </CardBody>
      </Card>

      <div className="flex justify-between">
        <Link href={`/audits/${auditId}/action-plan`} className="font-medium text-(--color-blue) hover:underline">
          View your 30-day action plan →
        </Link>
      </div>
    </div>
  );
}
