"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAuditSchema, autosaveBatchSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { validateAuditReadiness } from "@/lib/questions/validate";
import { buildAnswersWithBrandPrefill } from "@/lib/questions/prefill";

export interface ActionState {
  error?: string;
  success?: string;
}

// There was previously no limit at all on how many audits one account
// could submit for real AI processing — every audit costs real OpenAI
// spend, and with signup free and (as of this writing) email
// confirmation off, nothing stopped unlimited free Deep Audits (the more
// expensive tier: vision calls, competitor fetch, website fetch, on top
// of the same 9 stages a Quick Audit runs) from one account, or from
// trivially many accounts. This raises the bar for casual abuse; it does
// not by itself stop a determined multi-account abuser — that also needs
// bot protection (Turnstile, wired up but inert until
// TURNSTILE_SECRET_KEY is configured — see src/lib/security/turnstile.ts)
// and enforced email confirmation (a Supabase Dashboard setting, see
// HARDENING_REPORT.md's Email Verification update) actually turned on.
//
// These defaults are a starting guess, not a business decision — set
// MAX_FREE_QUICK_AUDITS_PER_ACCOUNT / MAX_FREE_DEEP_AUDITS_PER_ACCOUNT
// explicitly once the real numbers are decided. Either can be set to 0
// (or a negative number) to disable that cap entirely.
const MAX_FREE_AUDITS_PER_ACCOUNT: Record<"quick" | "deep", number> = {
  quick: Number(process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT ?? 5),
  deep: Number(process.env.MAX_FREE_DEEP_AUDITS_PER_ACCOUNT ?? 2),
};

export async function createAuditAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createAuditSchema.safeParse({
    brand_id: formData.get("brand_id"),
    audit_type: formData.get("audit_type"),
  });
  if (!parsed.success) return { error: "Choose a brand and an audit type." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rl = await checkRateLimit(`audit-create:${user.id}`, RATE_LIMITS.auditCreate);
  if (!rl.allowed) return { error: "You've created a lot of audits recently. Please try again later." };

  const { data, error } = await supabase
    .from("audits")
    .insert({
      brand_id: parsed.data.brand_id,
      owner_id: user.id,
      audit_type: parsed.data.audit_type,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not start audit. Please try again." };

  redirect(`/audits/${data.id}`);
}

export async function saveAuditResponsesAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = autosaveBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid response payload." };

  const supabase = await createClient();
  const rows = parsed.data.responses.map((r) => ({
    audit_id: parsed.data.audit_id,
    section: r.section,
    question_key: r.question_key,
    answer: r.answer ?? null,
  }));

  const { error } = await supabase.from("audit_responses").upsert(rows, { onConflict: "audit_id,question_key" });
  if (error) return { ok: false, error: "Could not save your answers." };

  return { ok: true };
}

/**
 * Transitions an audit from draft -> ready. This is a state-machine
 * boundary (spec §25) as well as a security boundary (hardening pass §5),
 * so it re-validates everything server-side rather than trusting that the
 * client-side wizard enforced its own required-field gating:
 *
 *  - the caller must be signed in and must own the audit (RLS on the
 *    `.eq("owner_id", user.id)` update also enforces this at the DB
 *    layer, but checking explicitly here gives a clear error instead of
 *    a silently-affected-zero-rows update)
 *  - the audit must currently be in "draft" (blocks e.g. re-submitting a
 *    completed/processing audit)
 *  - every question required for this audit's type must have a
 *    non-empty, correctly-shaped answer (validateAuditReadiness)
 */
export async function submitAuditForProcessingAction(auditId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: audit } = await supabase
    .from("audits")
    .select("id, owner_id, audit_type, status, brand_id")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit || audit.owner_id !== user.id) {
    return { error: "Audit not found." };
  }
  if (audit.status !== "draft") {
    return { error: "This audit has already been submitted." };
  }

  const freeCap = MAX_FREE_AUDITS_PER_ACCOUNT[audit.audit_type];
  if (freeCap > 0) {
    // Counts audits that were actually ever submitted for processing
    // (i.e. left "draft"), not abandoned drafts — starting and never
    // finishing an audit shouldn't burn the account's free quota.
    const { count } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("audit_type", audit.audit_type)
      .in("status", ["ready", "processing", "completed", "failed"]);
    if ((count ?? 0) >= freeCap) {
      const label = audit.audit_type === "deep" ? "Deep Audit" : "Quick Audit";
      return {
        error: `You've used all ${freeCap} free ${label}${freeCap === 1 ? "" : "s"} on this account. Contact us if you'd like to talk about ongoing access.`,
      };
    }
  }

  const [{ data: responseRows }, { data: brand }] = await Promise.all([
    supabase.from("audit_responses").select("question_key, answer").eq("audit_id", auditId),
    supabase.from("brands").select("*").eq("id", audit.brand_id).maybeSingle(),
  ]);

  const savedAnswers: Record<string, unknown> = {};
  for (const row of responseRows ?? []) {
    savedAnswers[row.question_key] = row.answer;
  }

  // Must mirror the wizard's own prefill merge (see
  // buildAnswersWithBrandPrefill's comment) — otherwise a business-section
  // field the user accepted as prefilled and never re-typed (nothing calls
  // the autosave action for a field that was never touched) gets rejected
  // here as "missing" even though the wizard already treated the section
  // as complete with that same value. Found live: this used to validate
  // against `audit_responses` alone and rejected every business-section
  // field, Business name included, on a real Quick Audit submission.
  const answers = buildAnswersWithBrandPrefill(brand, savedAnswers);

  const issues = validateAuditReadiness(audit.audit_type, answers);
  if (issues.length > 0) {
    return { error: `Please complete all required fields: ${issues.map((i) => i.message).join(" ")}` };
  }

  const { error } = await supabase.from("audits").update({ status: "ready" }).eq("id", auditId).eq("status", "draft");
  if (error) return { error: "Could not submit audit." };

  revalidatePath(`/audits/${auditId}`);
  redirect(`/audits/${auditId}`);
}

export async function cancelAuditAction(auditId: string) {
  const supabase = await createClient();
  await supabase.from("audits").update({ status: "cancelled" }).eq("id", auditId);
  revalidatePath("/audits");
  redirect("/audits");
}

const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME ?? "brand-assets";

/**
 * Permanently deletes one audit and everything under it (data-deletion
 * flow — there was no hard-delete path for a single audit in the original
 * build, only cancellation, which just flips status and keeps the data).
 *
 * Storage files are removed explicitly first: the DB's `on delete cascade`
 * from audits -> audit_assets (migration 0002) will remove the *rows*, but
 * never touches the actual objects sitting in the Supabase Storage bucket,
 * which would otherwise leak forever. RLS-scoped throughout, so this can
 * only ever act on an audit (and its assets) the caller owns.
 */
export async function deleteAuditAction(auditId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: audit } = await supabase.from("audits").select("id, owner_id").eq("id", auditId).maybeSingle();
  if (!audit || audit.owner_id !== user.id) return { error: "Audit not found." };

  const { data: assets } = await supabase.from("audit_assets").select("storage_path").eq("audit_id", auditId);
  if (assets && assets.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(assets.map((a) => a.storage_path));
  }

  const { error } = await supabase.from("audits").delete().eq("id", auditId);
  if (error) return { error: "Could not delete audit." };

  revalidatePath("/audits");
  redirect("/audits");
}

export async function retryAuditAction(auditId: string) {
  const supabase = await createClient();
  await supabase.from("audits").update({ status: "ready", processing_error: null }).eq("id", auditId).eq("status", "failed");
  revalidatePath(`/audits/${auditId}`);
  redirect(`/audits/${auditId}`);
}
