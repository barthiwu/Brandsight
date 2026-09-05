import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY. Import only
 * inside server-only code (route handlers, server actions, the AI
 * pipeline) that has already established authorization by other means
 * (an authenticated + ownership-checked request, or the admin allowlist).
 *
 * The `server-only` import makes any accidental client-bundle import of
 * this module fail the build instead of shipping the service role key.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase admin client requested but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured."
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
