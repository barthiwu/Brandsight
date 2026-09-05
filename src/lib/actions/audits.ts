"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAuditSchema, autosaveBatchSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { validateAuditReadiness } from "@/lib/questions/validate";

export interface ActionState {
  error?: string;
  success?: string;
}

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
    .select("id, owner_id, audit_type, status")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit || audit.owner_id !== user.id) {
    return { error: "Audit not found." };
  }
  if (audit.status !== "draft") {
    return { error: "This audit has already been submitted." };
  }

  const { data: responseRows } = await supabase
    .from("audit_responses")
    .select("question_key, answer")
    .eq("audit_id", auditId);

  const answers: Record<string, unknown> = {};
  for (const row of responseRows ?? []) {
    answers[row.question_key] = row.answer;
  }

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
