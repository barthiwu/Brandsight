import { describe, expect, it } from "vitest";
import {
  formatCompetitorProvidedEvidence,
  formatCompetitorFetchedEvidence,
  formatCompetitorErrorEvidence,
  MAX_COMPETITORS_TO_FETCH,
} from "@/lib/ai/pipeline/competitorEvidenceFormat";
import type { WebsiteFetchResult } from "@/lib/evidence/websiteFetcher";

const COMPETITOR = { name: "Rival Roasters", url: "https://rivalroasters.example.com", notes: "Bigger ad budget." };

describe("formatCompetitorProvidedEvidence", () => {
  it("is always 'provided' status regardless of whether a URL exists", () => {
    const withUrl = formatCompetitorProvidedEvidence(COMPETITOR);
    expect(withUrl.evidence_status).toBe("provided");
    expect(withUrl.dimension).toBe("competition");
    expect(withUrl.content).toContain("Rival Roasters");
    expect(withUrl.content).toContain("Bigger ad budget.");

    const withoutUrl = formatCompetitorProvidedEvidence({ name: "No Site Co", url: null });
    expect(withoutUrl.evidence_status).toBe("provided");
    expect(withoutUrl.source_reference).toBeNull();
  });
});

describe("formatCompetitorFetchedEvidence", () => {
  it("marks a successful fetch as 'observed' and includes the extracted summary", () => {
    const result: WebsiteFetchResult = {
      status: "fetched",
      title: "Rival Roasters — Home",
      description: "Great coffee.",
      headings: ["Our story", "Menu"],
      ctaText: ["Order now"],
      contactInformation: {},
      trustSignals: ["Testimonials or case studies present"],
    };
    const row = formatCompetitorFetchedEvidence(COMPETITOR, result);
    expect(row.evidence_status).toBe("observed");
    expect(row.content).toContain("Rival Roasters — Home");
    expect(row.content).toContain("Order now");
  });

  it("marks a failed fetch as 'unavailable' and never fabricates content", () => {
    const result: WebsiteFetchResult = {
      status: "failed",
      headings: [],
      ctaText: [],
      contactInformation: {},
      trustSignals: [],
      errorMessage: "Blocked by SSRF policy.",
    };
    const row = formatCompetitorFetchedEvidence(COMPETITOR, result);
    expect(row.evidence_status).toBe("unavailable");
    expect(row.content).toContain("Blocked by SSRF policy.");
    expect(row.content).not.toContain("Order now");
  });
});

describe("formatCompetitorErrorEvidence", () => {
  it("records a thrown error honestly as unavailable evidence", () => {
    const row = formatCompetitorErrorEvidence(COMPETITOR, new Error("network timeout"));
    expect(row.evidence_status).toBe("unavailable");
    expect(row.content).toContain("network timeout");
  });

  it("handles a non-Error throw without crashing", () => {
    const row = formatCompetitorErrorEvidence(COMPETITOR, "weird string throw");
    expect(row.evidence_status).toBe("unavailable");
    expect(row.content).toContain("unknown error");
  });
});

describe("MAX_COMPETITORS_TO_FETCH", () => {
  it("matches the competitor list cap enforced elsewhere (spec §35)", () => {
    expect(MAX_COMPETITORS_TO_FETCH).toBe(5);
  });
});
