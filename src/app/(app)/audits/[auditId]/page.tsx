import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/audit/OnboardingWizard";
import { ProcessingView } from "@/components/audit/ProcessingView";
import { FailedView } from "@/components/audit/FailedView";
import { AuditOverview } from "@/components/audit/AuditOverview";
import { Alert } from "@/components/ui/Alert";
import { AUDIT_QUESTIONS } from "@/lib/questions/config";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  params: Promise<{ auditId: string }>;
}

export default async function AuditPage({ params }: AuditPageProps) {
  const { auditId } = await params;
  const supabase = await createClient();

  const { data: audit } = await supabase.from("audits").select("*").eq("id", auditId).maybeSingle();
  if (!audit) notFound();

  if (audit.status === "draft" || audit.status === "ready") {
    const [{ data: brand }, { data: responseRows }, { data: competitors }, { data: socials }] = await Promise.all([
      supabase.from("brands").select("*").eq("id", audit.brand_id).single(),
      supabase.from("audit_responses").select("question_key, answer").eq("audit_id", auditId),
      supabase.from("competitors").select("*").eq("brand_id", audit.brand_id).order("created_at"),
      supabase.from("social_profiles").select("*").eq("brand_id", audit.brand_id).order("created_at"),
    ]);

    const savedAnswers: Record<string, unknown> = {};
    for (const row of responseRows ?? []) savedAnswers[row.question_key] = row.answer;

    // Pre-fill business-section answers from the brand's existing profile
    // (an engineering choice: the same fields exist on `brands` so
    // returning users shouldn't have to retype them). Saved audit
    // responses always win if the user has already edited them here.
    const prefill: Record<string, unknown> = {
      business_name: brand?.name,
      industry: brand?.industry,
      country: brand?.country,
      business_description: brand?.description,
      primary_product_service: brand?.primary_product_service,
      business_model: brand?.business_model,
      city: brand?.city,
      years_operating: brand?.years_operating,
    };

    const initialAnswers = Object.fromEntries(
      AUDIT_QUESTIONS.map((q) => [q.question_key, savedAnswers[q.question_key] ?? prefill[q.question_key] ?? null])
    );

    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-(--color-text)">
          {audit.audit_type === "deep" ? "Deep audit" : "Quick audit"} — {brand?.name}
        </h1>
        <OnboardingWizard
          auditId={auditId}
          brandId={audit.brand_id}
          auditType={audit.audit_type}
          initialAnswers={initialAnswers}
          websiteUrl={brand?.website_url ?? null}
          competitors={competitors ?? []}
          socialProfiles={socials ?? []}
        />
      </div>
    );
  }

  if (audit.status === "processing") {
    return <ProcessingView auditId={auditId} />;
  }

  if (audit.status === "failed") {
    return <FailedView auditId={auditId} errorMessage={audit.processing_error} />;
  }

  if (audit.status === "cancelled") {
    return <Alert tone="info">This audit was cancelled.</Alert>;
  }

  return <AuditOverview auditId={auditId} />;
}
