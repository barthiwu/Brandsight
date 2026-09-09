"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema, signInSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rateLimit";

export interface AuthActionState {
  error?: string;
  success?: string;
}

export async function signUpAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const rl = await checkRateLimit(`signup:${parsed.data.email.toLowerCase()}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) return { error: "Too many attempts. Please try again later." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // Supabase only withholds a session when email confirmation is required
  // (Auth > Sign In / Providers > Email > "Confirm email" is ON). When it's
  // off — as on a dev/test project, or if a project disables it in
  // production — signUp() auto-confirms and returns a live session
  // immediately, and the user is already signed in at this point. Showing a
  // "check your email" message in that case would strand them on a page
  // that never resolves, since no confirmation email is coming (or if one
  // is, they don't need it). Redirect straight in whenever a session came
  // back; only fall back to the "check your email" copy when it didn't.
  if (data.session) {
    redirect("/dashboard");
  }

  return { success: "Check your email to confirm your account, then sign in." };
}

export async function signInAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const rl = await checkRateLimit(`signin:${parsed.data.email.toLowerCase()}`, { limit: 10, windowSeconds: 900 });
  if (!rl.allowed) return { error: "Too many attempts. Please try again later." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: "Incorrect email or password." };

  const redirectTo = formData.get("redirectTo");
  redirect(typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const rl = await checkRateLimit(`forgot-password:${parsed.data.email.toLowerCase()}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return { error: "Too many attempts. Please try again later." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  // Always return success regardless of whether the email exists, to avoid
  // leaking which addresses have accounts.
  return { success: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signInWithGoogleAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error || !data?.url) {
    // Google OAuth not configured in this Supabase project — fail
    // gracefully rather than breaking the page (spec §5: app must still
    // function correctly without Google OAuth configured).
    redirect("/login?error=google_unavailable");
  }

  redirect(data.url);
}
