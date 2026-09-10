import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// Sets the "dark" class on <html> synchronously, before first paint, so a
// returning dark-mode user never sees a flash of the light theme while
// React hydrates. Reads the user's saved choice (ThemeToggle.tsx writes it
// to localStorage on every toggle) and falls back to the OS/browser's
// prefers-color-scheme when nothing has been saved yet. Deliberately a
// plain inline script rather than a React effect: an effect only runs
// after the initial render has already painted in the wrong theme.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

// Deliberately NOT using next/font/google (Inter) here: it fetches the font
// from fonts.googleapis.com at build time, and this build ran in a sandbox
// whose network policy blocks that host (see the final build report). The
// --font-inter CSS variable is defined as a system-font stack in
// globals.css instead, so the app never depends on an external fetch to
// build or render. Swapping back to next/font/google in an environment
// with normal internet access (e.g. Vercel) is a one-line change here.

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "BrandSight — See Your Brand Clearly",
    template: "%s — BrandSight",
  },
  description:
    "Get a free AI-powered marketing audit that shows what's working, what's holding your brand back, and what to fix next.",
  openGraph: {
    title: "BrandSight — See Your Brand Clearly",
    description:
      "Get a free AI-powered marketing audit that shows what's working, what's holding your brand back, and what to fix next.",
    url: appUrl,
    siteName: "BrandSight",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BrandSight — See Your Brand Clearly",
    description:
      "Get a free AI-powered marketing audit that shows what's working, what's holding your brand back, and what to fix next.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-(--color-bg) text-(--color-text)">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
