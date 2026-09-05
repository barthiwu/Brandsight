import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAuditPipeline } from "@/lib/ai/pipeline/runPipeline";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

// AI pipeline calls are sequential and can legitimately take a couple of
// minutes for a Deep Audit; give this route room to finish rather than
// timing out mid-pipeline. (On platforms with a hard ceiling below this,
// e.g. Vercel Hobby, a background job/queue would be the production
// answer — documented as a known V1 limitation in the README.)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ auditId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { auditId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Ownership check via the caller's own RLS-scoped client — never trust
  // the auditId alone (spec §75).
  const { data: audit, error } = await supabase.from("audits").select("id, status, owner_id").eq("id", auditId).maybeSingle();
  if (error || !audit || audit.owner_id !== user.id) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  const rl = await checkRateLimit(`audit-process:${user.id}`, RATE_LIMITS.auditProcess);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many processing requests. Please try again shortly." }, { status: 429 });
  }

  if (audit.status !== "ready" && audit.status !== "failed") {
    // Already processing/completed/etc — nothing to do. Returning success
    // keeps this endpoint idempotent from the client's point of view.
    return NextResponse.json({ status: audit.status });
  }

  const admin = createAdminClient();
  const { data: lockAcquired } = await admin.rpc("try_lock_audit_processing", { p_audit_id: auditId });

  if (!lockAcquired) {
    // Another request already won the lock (e.g. a duplicate click) —
    // spec §58: never run the pipeline twice concurrently for one audit.
    return NextResponse.json({ status: "processing", note: "Already in progress." });
  }

  await runAuditPipeline(auditId);

  const { data: finalAudit } = await supabase.from("audits").select("status").eq("id", auditId).maybeSingle();

  return NextResponse.json({ status: finalAudit?.status ?? "unknown" });
}
