import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/audit/OnboardingWizard";
import { ProcessingView } from "@/components/audit/ProcessingView";
import { FailedView } from "@/components/audit/FailedView";
import { AuditOverview } from "@/components/audit/AuditOverview";
import { DeleteAuditButton } from "@/components/audit/DeleteAuditButton";
import { Alert } from "@/components/ui/Alert";
import { buildAnswersWithBrandPrefill } from "@/lib/questions/prefill";
import { deleteAuditAction } from "@/lib/actions/audits";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  params: Promise<{ auditId: string }>;
}

export default async function AuditPage({ params }: AuditPageProps) {
  const { auditId } = await params;
  const supabase = await createClient();

  const { data: audit } = await supabase.from("audits").select("*").eq("id", auditId).maybeSingle();
  if (!audit) notFound();

  if (audit.status === "draft") {
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
    // responses always win if the user has already edited them here. This
    // merge MUST match submitAuditForProcessingAction's — see
    // buildAnswersWithBrandPrefill's own comment for why.
    const initialAnswers = buildAnswersWithBrandPrefill(brand, savedAnswers);

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

  if (audit.status === "ready" || audit.status === "processing") {
    // ProcessingView is the actual trigger, not just a spinner: it POSTs to
    // /api/audits/[auditId]/process on mount (idempotent — the route's own
    // advisory lock via try_lock_audit_processing makes a duplicate/late
    // call a no-op) and polls until the pipeline finishes. Before this fix,
    // "ready" was grouped with "draft" above and re-rendered the wizard
    // instead, so nothing ever called that route and a submitted audit sat
    // at "ready" forever — caught live: the E2E happy-path run got through
    // the whole wizard and submit, then just landed back on the wizard
    // instead of a processing/report state.
    return <ProcessingView auditId={auditId} />;
  }

  if (audit.status === "failed") {
    return <FailedView auditId={auditId} errorMessage={audit.processing_error} />;
  }

  if (audit.status === "cancelled") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert tone="info">This audit was cancelled.</Alert>
        <DeleteAuditButton auditId={auditId} deleteAction={deleteAuditAction} />
      </div>
    );
  }

  return <AuditOverview auditId={auditId} />;
}
