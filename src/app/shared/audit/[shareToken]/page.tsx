import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { FindingTypeBadge, ConfidenceBadge } from "@/components/ui/Badge";
import { ScoreDisplay } from "@/components/audit/ScoreDisplay";
import { LeadCaptureForm } from "@/components/audit/LeadCaptureForm";
import { DIMENSION_LABELS } from "@/lib/scoring/dimensions";
import { getScoreBand } from "@/lib/scoring/dimensions";
import type { ConfidenceLevel, DimensionKey } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared audit", robots: { index: false, follow: false } };

interface SharedAuditPageProps {
  params: Promise<{ shareToken: string }>;
}

interface SharedReport {
  audit: {
    id: string;
    audit_type: "quick" | "deep";
    overall_score: number | null;
    overall_confidence: ConfidenceLevel | null;
    executive_summary: string | null;
    completed_at: string | null;
  };
  brand: { name: string; industry: string | null; website_url: string | null };
  dimensions: { dimension_key: DimensionKey; score: number | null; confidence: ConfidenceLevel; summary: string | null }[];
  findings: { dimension_key: DimensionKey; type: "strength" | "weakness" | "opportunity"; title: string; description: string; confidence: ConfidenceLevel }[];
  recommendations: { dimension_key: DimensionKey; title: string; description: string; impact: string | null; difficulty: string | null; timeframe: string | null }[];
  action_plan: { plan_30_day: { fixFirst?: { title: string; whyItMatters: string }[] } } | null;
}

export default async function SharedAuditPage({ params }: SharedAuditPageProps) {
  const { shareToken } = await params;
  const supabase = await createClient();

  // Public, unauthenticated read — enforced entirely by the
  // get_shared_audit_report SECURITY DEFINER function, which only ever
  // returns curated, non-private fields for an active, non-expired share.
  const { data, error } = await supabase.rpc("get_shared_audit_report", { p_token: shareToken });
  if (error || !data) notFound();

  const report = data as unknown as SharedReport;

  return (
    <div className="min-h-screen bg-(--color-bg) px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="text-center">
          <Link href="/" className="text-[1.63rem] font-bold tracking-tight text-(--color-logo)">
            BrandSight
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-(--color-text)">{report.brand.name}</h1>
          <p className="text-sm text-(--color-text-secondary)">Shared marketing audit report</p>
        </div>

        <ScoreDisplay
          score={report.audit.overall_score}
          band={report.audit.overall_score != null ? getScoreBand(report.audit.overall_score) : null}
          confidence={report.audit.overall_confidence ?? undefined}
        />

        {report.audit.executive_summary && (
          <Card>
            <CardHeader>
              <CardTitle>Executive summary</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm leading-relaxed text-(--color-text)">{report.audit.executive_summary}</p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Dimension scores</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {report.dimensions.map((d) => (
                <li key={d.dimension_key} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-(--color-text)">{DIMENSION_LABELS[d.dimension_key]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-(--color-text-secondary)">{d.score != null ? `${d.score}/100` : "N/A"}</span>
                    <ConfidenceBadge confidence={d.confidence} />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-4">
              {report.findings.map((f, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <FindingTypeBadge type={f.type} />
                  <p className="font-medium text-(--color-text)">{f.title}</p>
                  <p className="text-sm text-(--color-text-secondary)">{f.description}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="flex flex-col gap-4">
              {report.recommendations.map((r, i) => (
                <li key={i}>
                  <p className="font-medium text-(--color-text)">
                    {i + 1}. {r.title}
                  </p>
                  <p className="text-sm text-(--color-text-secondary)">{r.description}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        {report.action_plan?.plan_30_day?.fixFirst && report.action_plan.plan_30_day.fixFirst.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fix first</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="flex flex-col gap-3">
                {report.action_plan.plan_30_day.fixFirst.map((item, i) => (
                  <li key={i}>
                    <p className="font-medium text-(--color-text)">{item.title}</p>
                    <p className="text-sm text-(--color-text-secondary)">{item.whyItMatters}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Want help putting these recommendations into action?</CardTitle>
          </CardHeader>
          <CardBody>
            <LeadCaptureForm shareToken={shareToken} />
          </CardBody>
        </Card>

        <p className="text-center text-xs text-(--color-text-secondary)">
          This is a read-only shared view generated by{" "}
          <Link href="/" className="text-(--color-blue) hover:underline">
            BrandSight
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
