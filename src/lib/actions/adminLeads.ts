"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/security/adminAuth";
import { leadStatusUpdateSchema } from "@/lib/validation/schemas";

export async function updateLeadStatusAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return;

  const parsed = leadStatusUpdateSchema.safeParse({
    lead_id: formData.get("lead_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const admin = createAdminClient();
  await admin.from("leads").update({ status: parsed.data.status }).eq("id", parsed.data.lead_id);
  revalidatePath("/admin/leads");
}
