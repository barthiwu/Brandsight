import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/security/adminAuth";
import { AppShell } from "@/components/dashboard/AppShell";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/audits", label: "Audits" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/system", label: "System" },
];

// Admin authorization is server-side and re-checked here on every admin
// request — never inferred from a hidden nav link (spec §73).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  return (
    <AppShell email={user.email} isAdmin>
      <div className="flex flex-col gap-6">
        <nav className="flex gap-2 border-b border-(--color-border) pb-3">
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-1.5 text-sm font-medium text-(--color-text) hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </AppShell>
  );
}
