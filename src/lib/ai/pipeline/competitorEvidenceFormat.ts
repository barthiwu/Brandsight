import type { DimensionKey, EvidenceSourceType, EvidenceStatus, ConfidenceLevel } from "@/types/database";
import type { WebsiteFetchResult } from "@/lib/evidence/websiteFetcher";

/**
 * Pure evidence-row formatting for competitor analysis, split out from
 * competitorPipeline.ts so it's directly unit-testable. competitorPipeline.ts
 * itself is "server-only" (it makes real network fetches), which throws
 * when imported outside a Next.js server context — the same reason
 * assetAnalysisSchemas.ts is separated from assetAnalysis.ts, and
 * ipRangeCheck.ts from ssrfGuard.ts.
 *
 * Note: the `import type` of WebsiteFetchResult below is erased entirely
 * at compile time, so it does not pull websiteFetcher.ts's "server-only"
 * side-effect import into this file's runtime output.
 */

export interface CompetitorInfo {
  name: string;
  url: string | null;
  notes?: string | null;
}

export interface CompetitorEvidenceRow {
  dimension: DimensionKey;
  source_type: EvidenceSourceType;
  source_reference: string | null;
  content: string | null;
  evidence_status: EvidenceStatus;
  confidence: ConfidenceLevel;
}

// Matches competitorListSchema's cap (spec §35) — never fetch more than
// the user was ever allowed to enter.
export const MAX_COMPETITORS_TO_FETCH = 5;

/** The business owner's typed name/URL/notes — always "provided" evidence, regardless of audit type or fetch outcome. */
export function formatCompetitorProvidedEvidence(competitor: CompetitorInfo): CompetitorEvidenceRow {
  return {
    dimension: "competition",
    source_type: "competitor",
    source_reference: competitor.url,
    evidence_status: "provided",
    confidence: "medium",
    content: `Competitor named by business owner: ${competitor.name}${competitor.url ? ` (${competitor.url})` : ""}${
      competitor.notes ? ` — notes: ${competitor.notes}` : ""
    }`,
  };
}

/** A successful or failed fetch of the competitor's own site — never claims content that wasn't actually retrieved. */
export function formatCompetitorFetchedEvidence(competitor: CompetitorInfo, result: WebsiteFetchResult): CompetitorEvidenceRow {
  const url = competitor.url ?? "";
  if (result.status === "fetched") {
    const summary = [
      result.title && `Title: ${result.title}`,
      result.description && `Meta description: ${result.description}`,
      result.headings.length > 0 && `Headings: ${result.headings.slice(0, 10).join(" | ")}`,
      result.ctaText.length > 0 && `CTAs found: ${result.ctaText.join(", ")}`,
      result.trustSignals.length > 0 && `Trust signals: ${result.trustSignals.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      dimension: "competition",
      source_type: "competitor",
      source_reference: url,
      evidence_status: "observed",
      confidence: "medium",
      content: `Website evidence for competitor "${competitor.name}" (${url}):\n${
        summary || "(page fetched, but no structured content could be extracted)"
      }`,
    };
  }

  return {
    dimension: "competition",
    source_type: "competitor",
    source_reference: url,
    evidence_status: "unavailable",
    confidence: "low",
    content: `Competitor "${competitor.name}"'s website (${url}) could not be fetched: ${result.errorMessage ?? "unknown error"}. Not analyzed — never fabricated.`,
  };
}

/** An exception thrown while attempting the fetch (as opposed to a clean failed-fetch result) — recorded just as honestly. */
export function formatCompetitorErrorEvidence(competitor: CompetitorInfo, err: unknown): CompetitorEvidenceRow {
  const url = competitor.url ?? "";
  return {
    dimension: "competition",
    source_type: "competitor",
    source_reference: url,
    evidence_status: "unavailable",
    confidence: "low",
    content: `Competitor "${competitor.name}"'s website (${url}) could not be analyzed (${err instanceof Error ? err.message : "unknown error"}).`,
  };
}
