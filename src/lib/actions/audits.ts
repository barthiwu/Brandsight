"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAuditSchema, autosaveBatchSchema } from "@/lib/validation/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

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

export async function submitAuditForProcessingAction(auditId: string): Promise<ActionState> {
  const supabase = await createClient();
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

export async function retryAuditAction(auditId: string) {
  const supabase = await createClient();
  await supabase.from("audits").update({ status: "ready", processing_error: null }).eq("id", auditId).eq("status", "failed");
  revalidatePath(`/audits/${auditId}`);
  redirect(`/audits/${auditId}`);
}
