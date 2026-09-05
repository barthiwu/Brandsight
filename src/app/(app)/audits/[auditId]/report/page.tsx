import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FindingTypeBadge } from "@/components/ui/Badge";
import { ScoreDisplay } from "@/components/audit/ScoreDisplay";
import { ShareToggle } from "@/components/audit/ShareToggle";
import { ALL_DIMENSION_KEYS, DIMENSION_LABELS, getScoreBand } from "@/lib/scoring/dimensions";
import { rankByPriority } from "@/lib/scoring/priority";

export const dynamic = "force-dynamic";

interface ReportPageProps {
  params: Promise<{ auditId: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { auditId } = await params;
  const supabase = await createClient();

  const [{ data: audit }, { data: dimensions }, { data: findings }, { data: recommendations }, { data: share }, { data: evidence }] = await Promise.all([
    supabase.from("audits").select("*, brands(name, industry, website_url)").eq("id", auditId).maybeSingle(),
    supabase.from("audit_dimensions").select("*").eq("audit_id", auditId),
    supabase.from("audit_findings").select("*").eq("audit_id", auditId),
    supabase.from("audit_recommendations").select("*").eq("audit_id", auditId),
    supabase.from("audit_shares").select("*").eq("audit_id", auditId).maybeSingle(),
    supabase.from("audit_evidence").select("*").eq("audit_id", auditId),
  ]);

  if (!audit || audit.status !== "completed") notFound();

  const brand = (audit as unknown as { brands: { name: string; industry: string | null; website_url: string | null } | null }).brands;
  const dimensionByKey = new Map((dimensions ?? []).map((d) => [d.dimension_key, d]));
  const rankedRecommendations = rankByPriority(recommendations ?? []);
  // Evidence traceability (hardening pass Known Issue #2) — see the
  // dimension detail page for the full explanation of evidence_ids.
  const evidenceById = new Map((evidence ?? []).map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-(--color-text-secondary)">Marketing Audit Report</p>
          <h1 className="text-2xl font-semibold text-(--color-text)">{brand?.name}</h1>
          <p className="text-sm text-(--color-text-secondary)">
            {brand?.industry} {audit.completed_at ? `· ${new Date(audit.completed_at).toLocaleDateString()}` : ""}
          </p>
        </div>
        <a href={`/api/audits/${auditId}/pdf`}>
          <Button variant="secondary">Download PDF</Button>
        </a>
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

      <Card>
        <CardHeader>
          <CardTitle>Dimension scores</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-col divide-y divide-(--color-border)">
            {ALL_DIMENSION_KEYS.map((key) => {
              const d = dimensionByKey.get(key);
              return (
                <li key={key} className="flex items-center justify-between py-3">
                  <Link href={`/audits/${auditId}/${key}`} className="text-sm font-medium text-(--color-text) hover:underline">
                    {DIMENSION_LABELS[key]}
                  </Link>
                  <span className="text-sm text-(--color-text-secondary)">{d?.score != null ? `${d.score}/100` : "N/A"}</span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All findings</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-col gap-4">
            {(findings ?? []).map((f) => {
              const citedEvidence = (f.evidence_ids ?? [])
                .map((id) => evidenceById.get(id))
                .filter((e): e is NonNullable<typeof e> => Boolean(e));
              return (
                <li key={f.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FindingTypeBadge type={f.type} />
                    <span className="text-xs text-(--color-text-secondary)">{DIMENSION_LABELS[f.dimension_key]}</span>
                  </div>
                  <p className="font-medium text-(--color-text)">{f.title}</p>
                  <p className="text-sm text-(--color-text-secondary)">{f.description}</p>
                  {citedEvidence.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-(--color-blue)">
                        Why: {citedEvidence.length} supporting evidence item{citedEvidence.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-1 flex flex-col gap-1 border-l-2 border-(--color-border) pl-3">
                        {citedEvidence.map((e) => (
                          <li key={e.id} className="text-xs text-(--color-text-secondary)">
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium capitalize">{e.evidence_status}</span>{" "}
                            {e.content}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Priority recommendations</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="flex flex-col gap-4">
            {rankedRecommendations.map((r, i) => (
              <li key={r.id} className="flex flex-col gap-1">
                <p className="font-medium text-(--color-text)">
                  {i + 1}. {r.title}
                </p>
                <p className="text-sm text-(--color-text-secondary)">{r.description}</p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="flex justify-center">
        <Link href={`/audits/${auditId}/action-plan`} className="font-medium text-(--color-blue) hover:underline">
          View the full 30-day action plan →
        </Link>
      </div>

      <Card className="bg-slate-50">
        <CardBody>
          <p className="text-xs leading-relaxed text-(--color-text-secondary)">
            This report was generated by an AI-assisted analysis of the information provided and evidence accessible
            at the time of the audit. It distinguishes observed, user-provided, and inferred evidence throughout, and
            is intended as a directional marketing health-check rather than a substitute for professional advice.
          </p>
        </CardBody>
      </Card>

      <ShareToggle
        auditId={auditId}
        initialToken={share?.share_token ?? null}
        initialActive={share?.is_active ?? false}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </div>
  );
}
