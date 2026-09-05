import "server-only";
import { fetchWebsiteEvidence } from "@/lib/evidence/websiteFetcher";
import type { Tables, AuditType } from "@/types/database";
import {
  MAX_COMPETITORS_TO_FETCH,
  formatCompetitorProvidedEvidence,
  formatCompetitorFetchedEvidence,
  formatCompetitorErrorEvidence,
  type CompetitorEvidenceRow,
} from "./competitorEvidenceFormat";

export type { CompetitorEvidenceRow } from "./competitorEvidenceFormat";

/**
 * Gathers competitor evidence (hardening pass Known Issue: the original
 * build recorded a competitor's name/URL/notes as "provided" evidence and
 * never actually visited the URL, even though the dimension analysis
 * prompt read as if the competitor's site had been considered). This
 * reuses the exact same SSRF-guarded, single-page fetcher used for the
 * brand's own website — no crawling, no new attack surface.
 *
 * Per the Quick-vs-Deep distinction (Known Issue #6), fetching a
 * competitor's website is Deep-only ("Deep adds actual ... competitor ...
 * analysis where actually obtainable"). A Quick audit still records
 * whatever the business owner typed about a competitor — that's honest,
 * user-provided context, not an external-analysis claim — it just never
 * fetches the URL.
 */
export async function gatherCompetitorEvidence(
  competitors: Tables<"competitors">[],
  auditType: AuditType
): Promise<CompetitorEvidenceRow[]> {
  const rows: CompetitorEvidenceRow[] = [];
  const scoped = competitors.slice(0, MAX_COMPETITORS_TO_FETCH);

  for (const competitor of scoped) {
    rows.push(formatCompetitorProvidedEvidence(competitor));

    if (auditType !== "deep" || !competitor.url) continue;

    try {
      const result = await fetchWebsiteEvidence(competitor.url);
      rows.push(formatCompetitorFetchedEvidence(competitor, result));
    } catch (err) {
      console.error(`[pipeline] competitor fetch failed for ${competitor.url}`, err);
      rows.push(formatCompetitorErrorEvidence(competitor, err));
    }
  }

  return rows;
}
