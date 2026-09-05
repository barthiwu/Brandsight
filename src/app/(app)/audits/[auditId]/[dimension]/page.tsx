import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfidenceBadge, FindingTypeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Alert";
import { ALL_DIMENSION_KEYS, DIMENSION_LABELS, DIMENSION_SUBCRITERIA, getScoreBand } from "@/lib/scoring/dimensions";
import type { DimensionKey } from "@/types/database";

export const dynamic = "force-dynamic";

interface DimensionPageProps {
  params: Promise<{ auditId: string; dimension: string }>;
}

export default async function DimensionDetailPage({ params }: DimensionPageProps) {
  const { auditId, dimension } = await params;

  if (!ALL_DIMENSION_KEYS.includes(dimension as DimensionKey)) notFound();
  const dimensionKey = dimension as DimensionKey;

  const supabase = await createClient();
  const [{ data: audit }, { data: dim }, { data: findings }, { data: recommendations }, { data: evidence }] =
    await Promise.all([
      supabase.from("audits").select("id, status").eq("id", auditId).maybeSingle(),
      supabase.from("audit_dimensions").select("*").eq("audit_id", auditId).eq("dimension_key", dimensionKey).maybeSingle(),
      supabase.from("audit_findings").select("*").eq("audit_id", auditId).eq("dimension_key", dimensionKey),
      supabase.from("audit_recommendations").select("*").eq("audit_id", auditId).eq("dimension_key", dimensionKey),
      supabase.from("audit_evidence").select("*").eq("audit_id", auditId).eq("dimension", dimensionKey),
    ]);

  if (!audit) notFound();
  if (audit.status !== "completed") notFound();

  const subcriteriaConfig = DIMENSION_SUBCRITERIA[dimensionKey];
  const subcriteriaScores = new Map(
    ((dim?.subcriteria as { key: string; score: number | null; rationale: string }[] | undefined) ?? []).map((s) => [s.key, s])
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/audits/${auditId}`} className="text-sm font-medium text-(--color-blue) hover:underline">
          ← Back to overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-(--color-text)">{DIMENSION_LABELS[dimensionKey]}</h1>
      </div>

      <Card>
        <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-4xl font-bold text-(--color-navy)">{dim?.score ?? "—"}/100</p>
            <p className="text-sm text-(--color-text-secondary)">{dim?.score != null ? getScoreBand(dim.score) : "Not enough evidence to score"}</p>
          </div>
          <ConfidenceBadge confidence={dim?.confidence ?? "low"} />
        </CardBody>
      </Card>

      {dim?.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm leading-relaxed text-(--color-text)">{dim.summary}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scoring breakdown</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-col divide-y divide-(--color-border)">
            {subcriteriaConfig.map((c) => {
              const s = subcriteriaScores.get(c.key);
              return (
                <li key={c.key} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-(--color-text)">{c.label}</p>
                    <p className="text-xs text-(--color-text-secondary)">Weight: {Math.round(c.weight * 100)}%</p>
                    {s?.rationale && <p className="mt-1 text-xs text-(--color-text-secondary)">{s.rationale}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-(--color-text)">
                    {s?.score != null ? `${s.score}/100` : "Unavailable"}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
          </CardHeader>
          <CardBody>
            {findings && findings.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {findings.map((f) => (
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
              <EmptyState title="No findings for this dimension" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardBody>
            {recommendations && recommendations.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {recommendations.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1">
                    <span className="font-medium text-(--color-text)">{r.title}</span>
                    <p className="text-sm text-(--color-text-secondary)">{r.description}</p>
                    {r.action_steps && r.action_steps.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-sm text-(--color-text-secondary)">
                        {r.action_steps.map((step: string, i: number) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No recommendations for this dimension" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardBody>
          {evidence && evidence.length > 0 ? (
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {evidence.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-center gap-2 text-xs text-(--color-text-secondary)">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize">{e.evidence_status}</span>
                    <span className="capitalize">{e.source_type.replace("_", " ")}</span>
                  </div>
                  <p className="text-sm text-(--color-text)">{e.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No evidence recorded for this dimension" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
