import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Runs with the caller's session (RLS-enforced) — never
 * use this for privileged operations; see admin.ts for the service role.
 *
 * Create a fresh client per request (never module-level singleton), per
 * the @supabase/ssr contract.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component that can't set cookies.
            // proxy.ts refreshes the session on every navigation instead.
          }
        },
      },
    }
  );
}

/**
 * Convenience helper: the authenticated user for this request, verified
 * against the Supabase Auth server (never trusts a locally-decoded JWT
 * alone). Returns null when not signed in.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
