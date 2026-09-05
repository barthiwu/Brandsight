import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DIMENSION_LABELS, ALL_DIMENSION_KEYS } from "@/lib/scoring/dimensions";

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  positioning: "Is it obvious what you offer, to whom, and why it matters?",
  audience: "How clearly have you defined who you're actually for?",
  messaging: "Does your messaging communicate value and prompt action?",
  content: "Is your content strategic, varied, and consistent?",
  social: "How your social presence looks to a new visitor.",
  visual: "Consistency, professionalism, and recognizability of your brand.",
  digital: "How well your website converts a visitor into a customer.",
  competition: "Where you stand — and where the opportunity is — versus competitors.",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <header className="border-b border-(--color-border) bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight text-(--color-navy)">BrandSight</span>
          <nav className="flex items-center gap-4">
            <Link href="/how-it-works" className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text)">
              How it works
            </Link>
            <Link href="/login" className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text)">
              Log in
            </Link>
            <Link href="/signup">
              <Button size="sm">Start a Free Audit</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-(--color-navy) sm:text-5xl">See Your Brand Clearly.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-(--color-text-secondary)">
            Understand what&apos;s working. Find what&apos;s holding you back. Know what to fix next. Get a free,
            AI-powered marketing audit built for small and growing businesses.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup">
              <Button size="lg">Start a Free Audit</Button>
            </Link>
            <Link href="/how-it-works">
              <Button size="lg" variant="secondary">
                See how it works
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-(--color-text-secondary)">No credit card. Takes a few minutes.</p>
        </section>

        <section className="border-y border-(--color-border) bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-(--color-text)">Eight dimensions, one clear score</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-(--color-text-secondary)">
              BrandSight evaluates your marketing presence across every dimension that actually moves the needle —
              and shows its work, distinguishing what was observed, what you told us, and what we inferred.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ALL_DIMENSION_KEYS.map((key) => (
                <div key={key} className="rounded-xl border border-(--color-border) p-5">
                  <p className="font-semibold text-(--color-text)">{DIMENSION_LABELS[key]}</p>
                  <p className="mt-1 text-sm text-(--color-text-secondary)">{DIMENSION_DESCRIPTIONS[key]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-(--color-text)">What you get, free</h2>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {[
                { title: "Your BrandSight Score", desc: "One clear number plus a score for each of the eight dimensions." },
                { title: "Strengths & weaknesses", desc: "Evidence-backed findings — never invented, always explained." },
                { title: "A 30-day action plan", desc: "Prioritized, practical steps ranked by impact and difficulty." },
              ].map((item) => (
                <div key={item.title} className="text-center">
                  <p className="font-semibold text-(--color-text)">{item.title}</p>
                  <p className="mt-2 text-sm text-(--color-text-secondary)">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-(--color-navy) py-16 text-center text-white">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold">Ready to see your brand clearly?</h2>
            <p className="mt-3 text-sm text-slate-300">
              Create a free account and run your first audit in minutes.
            </p>
            <Link href="/signup" className="mt-6 inline-block">
              <Button size="lg">Start a Free Audit</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--color-border) bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-(--color-text-secondary) sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} BrandSight. A free tool from Blitz SMA.</span>
          <div className="flex gap-4">
            <Link href="/how-it-works" className="hover:text-(--color-text)">
              How it works
            </Link>
            <Link href="/login" className="hover:text-(--color-text)">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
