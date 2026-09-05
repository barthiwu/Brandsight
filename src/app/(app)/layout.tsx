import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/security/adminAuth";
import { AppShell } from "@/components/dashboard/AppShell";

// Defense in depth: proxy.ts already redirects unauthenticated visitors
// away from these routes, but authorization must never rely on a single
// layer (spec §75) — every server-rendered protected page re-derives the
// user from the verified session here too.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <AppShell email={user.email} isAdmin={isAdminEmail(user.email)}>
      {children}
    </AppShell>
  );
}
