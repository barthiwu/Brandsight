import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/brands", label: "Brands" },
  { href: "/audits", label: "Audits" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({
  children,
  email,
  isAdmin,
}: {
  children: ReactNode;
  email?: string | null;
  isAdmin?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-(--color-surface) focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <aside className="flex shrink-0 flex-col border-b border-(--color-border) bg-(--color-surface) lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          {/* Every other instance of this wordmark across the app links to
              "/" (the marketing homepage) — this was the one exception,
              linking to "/dashboard" instead, which is why clicking the
              logo while logged in didn't behave like clicking it anywhere
              else in the app (and looked like nothing happened at all when
              you were already on /dashboard). Matched to the rest for
              consistency. */}
          <Link href="/" className="text-[1.63rem] font-bold tracking-tight text-(--color-logo)">
            BrandSight
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-(--color-text) hover:bg-(--color-border)"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-(--color-blue) hover:bg-blue-50"
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-(--color-border) px-5 py-4">
          <span className="truncate text-xs text-(--color-text-secondary)" title={email ?? undefined}>
            {email}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text)">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
