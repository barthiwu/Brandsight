import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "How it works" };

const STEPS = [
  {
    title: "Tell us about your business",
    desc: "A short, structured onboarding — your business, audience, goals, and marketing today. Optionally add your website, social profiles, competitors, and brand assets — a Deep Audit will actually fetch and analyze the website/competitor sites and brand assets you provide.",
  },
  {
    title: "We analyze what's actually there",
    desc: "BrandSight reviews the evidence available — your answers, your website, and anything else you shared — and scores eight marketing dimensions using a fixed, transparent rubric. It never invents evidence it doesn't have.",
  },
  {
    title: "Get your BrandSight Score",
    desc: "An overall score, a score per dimension, clear strengths and weaknesses, confidence levels, and prioritized recommendations tied to specific findings.",
  },
  {
    title: "Follow your 30-day plan",
    desc: "A concrete, week-by-week action plan — starting with the highest-leverage fixes — plus a shareable, downloadable report.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-(--color-bg)">
      <header className="border-b border-(--color-border) bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-(--color-navy)">
            BrandSight
          </Link>
          <Link href="/signup">
            <Button size="sm">Start a Free Audit</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-(--color-navy)">How BrandSight works</h1>
        <p className="mt-4 text-(--color-text-secondary)">
          BrandSight follows a simple principle: diagnosis before recommendation, and evidence over invention.
          Here&apos;s what actually happens when you run an audit.
        </p>

        <ol className="mt-10 flex flex-col gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-blue) font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <h2 className="font-semibold text-(--color-text)">{step.title}</h2>
                <p className="mt-1 text-sm text-(--color-text-secondary)">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-xl border border-(--color-border) bg-white p-6">
          <h2 className="font-semibold text-(--color-text)">Quick vs. Deep Audit</h2>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            A Quick Audit takes a few minutes and is based entirely on the information you provide about your
            business, audience, and marketing. A Deep Audit adds a real, direct look at your website, any competitor
            sites you list, and any brand assets you upload — fetched and analyzed, not assumed. Neither audit type
            connects to social media platforms; social profiles are recorded as context, and the report says so
            plainly rather than guessing at content or engagement.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link href="/signup">
            <Button size="lg">Start a Free Audit</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
