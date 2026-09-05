import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles both the OAuth (Google) redirect and Supabase's magic-link /
// email-confirmation / password-recovery redirect, all of which arrive
// here with a `code` query param to exchange for a session (PKCE flow).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
