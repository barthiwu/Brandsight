import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAuditPipeline } from "@/lib/ai/pipeline/runPipeline";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { notifyAdminOfCapacityOverrun, notifyAdminOfPipelineFailure } from "@/lib/notifications/adminAlert";
import type { Database } from "@/types/database";

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

// Nothing capped how many audits could be "processing" at once before
// this existed — try_lock_audit_processing (migration 0004) only ever
// prevented the *same* audit from double-processing. On a single small
// instance (Render Starter: 0.5 CPU / 512MB), an unbounded number of
// concurrent ~130-300s pipeline runs — each one several sequential
// OpenAI calls plus, for Deep Audits, real outbound website/competitor
// fetches and vision analysis — was never load-tested and is a real risk
// the moment more than one person submits an audit around the same time.
// Tunable per the instance's actual headroom; 3 is a conservative
// starting point for that instance size, not a measured ceiling.
const MAX_CONCURRENT_AUDITS = Number(process.env.MAX_CONCURRENT_AUDITS ?? 3);

// ProcessingView.tsx fires this route once on mount and, from then on,
// only ever watches audits.status via polling — it does not retry on an
// error response (see its own comment). So rather than returning an
// immediate 429 that would strand the user on "Analyzing your brand…"
// forever with nothing actually happening, wait out a bounded window for
// a slot to free up (each pipeline run is 130-300s, so a slot freeing up
// within a minute is the common case for a short-lived burst).
const CAPACITY_WAIT_POLL_MS = 4_000;
const CAPACITY_WAIT_MAX_MS = 60_000;

/**
 * Tries to acquire the processing lock for `auditId`, waiting out a
 * bounded window if the instance is currently at MAX_CONCURRENT_AUDITS.
 * If the window elapses with capacity still full, admits the audit
 * anyway rather than stranding it — this is a soft cap meant to smooth
 * out a short burst, not a hard admission-control gate, since nothing
 * downstream of this route is built to retry a hard rejection. Returns
 * which happened so the caller can record it for /admin/system
 * visibility: a `false` acquired with `admittedOverCapacity: false` means
 * a *different* request already won the lock for this specific audit
 * (e.g. a duplicate click) — genuinely nothing to do here, not a
 * capacity issue at all.
 *
 * `lockError` is set only when an RPC call itself failed (a transient
 * Supabase/network error), as opposed to a normal `false` result. This
 * distinction matters: a bug here previously let a failed force-admit
 * RPC call (`data` comes back null/undefined on an error, since only
 * `error` was ever checked) fall through to `acquired: false`,
 * `admittedOverCapacity: true` — and the route's own `if (!acquired)`
 * branch returned early with a generic "already in progress" response
 * *before* ever checking `admittedOverCapacity`, so neither the pipeline
 * nor the admin alert ever ran. The audit's row never left
 * "ready"/"failed" (the force-admit UPDATE never happened), nothing was
 * ever going to retry it, and the client had just been told "processing"
 * — a permanently stuck audit with zero visibility into why. Surfacing
 * `lockError` lets the caller record a real failure instead of silently
 * doing nothing.
 */
export async function acquireProcessingSlot(
  admin: SupabaseClient<Database>,
  auditId: string
): Promise<{ acquired: boolean; admittedOverCapacity: boolean; lockError?: string }> {
  const deadline = Date.now() + CAPACITY_WAIT_MAX_MS;

  for (;;) {
    const { data: lockAcquired, error: lockError } = await admin.rpc("try_lock_audit_processing", {
      p_audit_id: auditId,
      p_max_concurrent: MAX_CONCURRENT_AUDITS,
    });
    if (lockError) return { acquired: false, admittedOverCapacity: false, lockError: lockError.message };
    if (lockAcquired) return { acquired: true, admittedOverCapacity: false };

    // A false result means either "at capacity" or "someone else already
    // claimed THIS audit" — check which, so a duplicate-click case
    // returns immediately instead of waiting out the whole window for an
    // audit that's already progressing under a different request.
    const { data: current, error: statusError } = await admin.from("audits").select("status").eq("id", auditId).maybeSingle();
    if (statusError) return { acquired: false, admittedOverCapacity: false, lockError: statusError.message };
    if (current?.status !== "ready" && current?.status !== "failed") {
      return { acquired: false, admittedOverCapacity: false };
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, CAPACITY_WAIT_POLL_MS));
  }

  console.warn(
    `[capacity] audit ${auditId} admitted over the ${MAX_CONCURRENT_AUDITS}-concurrent soft cap after a ${CAPACITY_WAIT_MAX_MS}ms wait — instance may need more headroom if this keeps happening.`
  );
  // Postgres's `int` (int4) tops out at 2147483647 — not
  // Number.MAX_SAFE_INTEGER, which would overflow it and error.
  const { data: forced, error: forceError } = await admin.rpc("try_lock_audit_processing", {
    p_audit_id: auditId,
    p_max_concurrent: 2147483647,
  });
  if (forceError) return { acquired: false, admittedOverCapacity: true, lockError: forceError.message };
  return { acquired: Boolean(forced), admittedOverCapacity: true };
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
  const { acquired, admittedOverCapacity, lockError } = await acquireProcessingSlot(admin, auditId);

  if (lockError) {
    // A real infra failure trying to acquire the lock itself — distinct
    // from "someone else already has it" (benign, handled below). Record
    // it as a real failure so the audit doesn't sit at "ready"/"failed"
    // forever with nothing ever acting on it again and no visibility
    // into why (see acquireProcessingSlot's doc comment for the bug this
    // closes).
    await admin
      .from("audits")
      .update({ status: "failed", processing_error: `Could not start processing: ${lockError}` })
      .eq("id", auditId);
    void notifyAdminOfPipelineFailure(auditId, `acquireProcessingSlot: ${lockError}`);
    return NextResponse.json({ error: "Could not start processing. Please try again." }, { status: 503 });
  }

  if (!acquired) {
    // Another request already won the lock (e.g. a duplicate click) —
    // spec §58: never run the pipeline twice concurrently for one audit.
    return NextResponse.json({ status: "processing", note: "Already in progress." });
  }

  if (admittedOverCapacity) {
    await admin.from("audits").update({ admitted_over_capacity: true }).eq("id", auditId);
    void notifyAdminOfCapacityOverrun(auditId);
  }

  await runAuditPipeline(auditId);

  const { data: finalAudit } = await supabase.from("audits").select("status").eq("id", auditId).maybeSingle();

  return NextResponse.json({ status: finalAudit?.status ?? "unknown" });
}
