"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export interface ActionState {
  error?: string;
  success?: string;
}

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
