"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export interface ActionState {
  error?: string;
  success?: string;
}

const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME ?? "brand-assets";

const schema = z.object({ fullName: z.string().trim().min(1).max(200) });

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { error: "Name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) return { error: "Could not update profile." };

  revalidatePath("/settings");
  return { success: "Profile updated." };
}

/**
 * Permanently deletes the caller's account and everything that depends on
 * it. There was no account-deletion flow at all in the original build —
 * a real gap against baseline privacy/data-deletion expectations, not one
 * of the six explicitly named Known Issues but surfaced by auditing the
 * rest of the app against the spec.
 *
 * Order matters: files in Supabase Storage are NOT covered by the
 * database's `on delete cascade` foreign keys — those only remove rows,
 * never objects in the storage bucket — so every asset file this user
 * owns must be removed explicitly BEFORE the owning rows disappear and we
 * lose their storage_path. Deleting the auth.users row itself (only
 * possible via the Admin API — a user can never do this to their own auth
 * record with an anon/authenticated-scoped client) then cascades through
 * profiles, brands, audits, and every audit-scoped child table via the
 * foreign keys already defined in supabase/migrations/000{1,2,3}.
 */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "DELETE") {
    return { error: 'Type "DELETE" (in capitals) to confirm. This permanently removes your account and cannot be undone.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // audit_assets.owner_id is denormalized directly onto the row (see
  // migration 0002), so this is a single query rather than a join through
  // every brand/audit the user owns.
  const { data: assets } = await supabase.from("audit_assets").select("storage_path").eq("owner_id", user.id);
  if (assets && assets.length > 0) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(assets.map((a) => a.storage_path));
    if (storageError) {
      // Don't silently proceed to delete the account while orphaning (or
      // failing to orphan-check) files — surface it and let the user retry.
      console.error("[account] failed to remove storage objects before account deletion", storageError);
      return { error: "Could not remove your uploaded files. Please try again." };
    }
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[account] deleteUser failed", deleteError);
    return { error: "Could not delete your account. Please try again or contact support." };
  }

  await supabase.auth.signOut();
  redirect("/");
}
