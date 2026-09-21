import { describe, it, expect, vi } from "vitest";

// Devil's-advocate follow-up: websiteFetcher.ts is a plain HTML parse
// with no headless browser (deliberately — the spec says never execute
// fetched JavaScript), so a JS-rendered site (Wix/Squarespace/Shopify
// themes, a React/Vue SPA shell) comes back `status: "fetched"` with
// almost nothing readable in it. Before this fix, that was silently
// treated exactly like a fully-read page — "observed" evidence, high
// confidence — so the AI would confidently assess a website it had
// effectively never read. These tests exercise buildEvidenceRows and
// renderContextForPrompt (pipeline/context.ts) directly against both a
// thin and a normally-rich fetched website_sources row, without needing
// the real network fetch or a live pipeline run.

vi.mock("server-only", () => ({}));

const baseWebsiteSource = {
  id: "ws-1",
  audit_id: "audit-1",
  url: "https://example.com",
  status: "fetched" as const,
  fetched_at: new Date().toISOString(),
  error_message: null,
  created_at: new Date().toISOString(),
};

const thinWebsiteSource = {
  ...baseWebsiteSource,
  title: null,
  description: null,
  headings: [] as string[],
  body_text: "Loading...",
  cta_text: [] as string[],
  contact_information: {},
  trust_signals: [] as string[],
};

const richWebsiteSource = {
  ...baseWebsiteSource,
  title: "Northstar Coffee — Specialty Coffee & Pastries",
  description: "A neighborhood specialty coffee shop in Portland.",
  headings: ["Welcome to Northstar Coffee", "Our Menu", "Visit Us"],
  body_text: "Northstar Coffee has been serving Portland's best specialty coffee since 2020. " + "Come visit our cozy neighborhood shop. ".repeat(10),
  cta_text: ["Order Now", "Get Started"],
  contact_information: { emails: ["hello@northstarcoffee.example"] },
  trust_signals: ["Testimonials or case studies present"],
};

const minimalCtx = (websiteSource: typeof thinWebsiteSource | typeof richWebsiteSource | null) => ({
  audit: { audit_type: "quick" } as never,
  brand: { name: "Northstar Coffee", industry: "Coffee", country: "US" } as never,
  audience: null,
  objectives: null,
  marketing: null,
  competitors: [],
  socialProfiles: [],
  responses: {},
  websiteSource: websiteSource as never,
  assets: [],
});

describe("thin website evidence detection", () => {
  it("buildEvidenceRows downgrades a thin fetch to inferred/unavailable, never 'observed'", async () => {
    const { buildEvidenceRows } = await import("@/lib/ai/pipeline/context");

    const rows = buildEvidenceRows(minimalCtx(thinWebsiteSource));
    const websiteRows = rows.filter((r) => r.source_type === "website");

    expect(websiteRows.length).toBeGreaterThan(0);
    for (const row of websiteRows) {
      expect(row.evidence_status).not.toBe("observed");
      expect(row.confidence).not.toBe("high");
    }
    // The digital-dimension row should say plainly that this couldn't
    // really be read, not present a confident (if empty) summary.
    const digitalRow = websiteRows.find((r) => r.dimension === "digital");
    expect(digitalRow?.content).toMatch(/javascript|could not|low-confidence/i);
  });

  it("buildEvidenceRows still marks a normally-rich fetch as observed/high-confidence", async () => {
    const { buildEvidenceRows } = await import("@/lib/ai/pipeline/context");

    const rows = buildEvidenceRows(minimalCtx(richWebsiteSource));
    const digitalRow = rows.find((r) => r.dimension === "digital" && r.source_type === "website");

    expect(digitalRow?.evidence_status).toBe("observed");
    expect(digitalRow?.confidence).toBe("high");
    expect(digitalRow?.content).toContain("Northstar Coffee");
  });

  it("renderContextForPrompt tells the model outright not to assess a thin fetch, instead of feeding it an empty-looking body excerpt", async () => {
    const { renderContextForPrompt } = await import("@/lib/ai/pipeline/context");

    const prompt = renderContextForPrompt(minimalCtx(thinWebsiteSource));

    expect(prompt).toMatch(/do not assess this website|javascript-rendered/i);
    expect(prompt).not.toContain("Body excerpt:");
  });

  it("renderContextForPrompt includes the real body excerpt for a rich fetch", async () => {
    const { renderContextForPrompt } = await import("@/lib/ai/pipeline/context");

    const prompt = renderContextForPrompt(minimalCtx(richWebsiteSource));

    expect(prompt).toContain("Body excerpt:");
    expect(prompt).toContain("Northstar Coffee has been serving Portland");
  });
});
