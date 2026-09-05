import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { AuditReportDocument } from "@/lib/pdf/AuditReportDocument";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ auditId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { auditId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [{ data: audit }, { data: dimensions }, { data: findings }, { data: recommendations }, { data: plan }] = await Promise.all([
    supabase.from("audits").select("*, brands(name)").eq("id", auditId).maybeSingle(),
    supabase.from("audit_dimensions").select("dimension_key, score, confidence, summary").eq("audit_id", auditId),
    supabase.from("audit_findings").select("dimension_key, type, title, description").eq("audit_id", auditId),
    supabase.from("audit_recommendations").select("title, description, why_it_matters, action_steps").eq("audit_id", auditId).order("priority_score", { ascending: false }),
    supabase.from("audit_action_plans").select("plan_30_day").eq("audit_id", auditId).maybeSingle(),
  ]);

  if (!audit || audit.status !== "completed") {
    return NextResponse.json({ error: "Report not available." }, { status: 404 });
  }

  const brandName = (audit as unknown as { brands: { name: string } | null }).brands?.name ?? "Your Business";

  const buffer = await renderToBuffer(
    AuditReportDocument({
      brandName,
      auditType: audit.audit_type,
      completedAt: audit.completed_at,
      overallScore: audit.overall_score,
      overallConfidence: audit.overall_confidence,
      executiveSummary: audit.executive_summary,
      dimensions: dimensions ?? [],
      findings: findings ?? [],
      recommendations: recommendations ?? [],
      actionPlan30Day: (plan?.plan_30_day as { fixFirst?: { title: string; whyItMatters: string; actionSteps: string[] }[] }) ?? null,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="brandsight-audit-${auditId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
