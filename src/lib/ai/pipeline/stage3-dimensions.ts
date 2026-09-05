import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { DimensionAnalysisBatchSchema, type DimensionAnalysis, type NormalizedContext } from "./schemas";
import { DIMENSION_SUBCRITERIA, DIMENSION_LABELS, ALL_DIMENSION_KEYS } from "@/lib/scoring/dimensions";
import { renderContextForPrompt } from "./context";
import type { AuditContext } from "./context";

/**
 * Stage 3 — Dimension Analysis. One structured call covering all eight
 * dimensions at once rather than eight separate calls: the subcriteria
 * weights are fixed and known (spec §39-46) and the evidence is shared
 * context, so batching cuts cost/latency ~8x with no loss of rigor — the
 * AI still scores every subcriterion independently, it just does so in
 * one pass. The deterministic scoring engine (lib/scoring/engine.ts),
 * not this call, turns these subcriteria into the actual dimension score.
 */
export async function runDimensionAnalysisStage(
  ctx: AuditContext,
  normalized: NormalizedContext,
  assetAnalysisByFileName?: Map<string, string>,
  competitorEvidenceLines?: string[]
): Promise<DimensionAnalysis[]> {
  const rubric = ALL_DIMENSION_KEYS.map((key) => {
    const criteria = DIMENSION_SUBCRITERIA[key].map((c) => `    - "${c.key}" (${Math.round(c.weight * 100)}%): ${c.label}`).join("\n");
    return `${key} — ${DIMENSION_LABELS[key]}\n${criteria}`;
  }).join("\n\n");

  const instructions = `${BASE_SYSTEM_RULES}

Task: Score each of the eight marketing dimensions below using ONLY the evidence provided. For each dimension, score every listed subcriterion from 0-100, OR return null for a subcriterion if the evidence genuinely does not support scoring it — never guess a plausible-looking number to fill a gap. Also report, per dimension, how many distinct pieces of evidence you used that were: independently observed (e.g. fetched website content), provided directly by the business owner, your own inference from limited signals, or unavailable/could not be assessed.

Dimensions and their subcriteria (weight shown for context only — you don't need to compute weighted averages, just score each subcriterion):

${rubric}`;

  const input = wrapExternalData(
    "audit_context",
    renderContextForPrompt(ctx, normalized, assetAnalysisByFileName, competitorEvidenceLines)
  );

  const result = await callStructuredStage({
    stage: "dimension_analysis",
    schema: DimensionAnalysisBatchSchema,
    schemaName: "dimension_analysis_batch",
    instructions,
    input,
  });

  // Defense in depth: drop any subcriterion key the model invented that
  // isn't part of our fixed rubric, so a hallucinated key can never sneak
  // into scoring with an unintended weight.
  return result.dimensions.map((d) => {
    const validKeys = new Set(DIMENSION_SUBCRITERIA[d.dimensionKey].map((c) => c.key));
    return { ...d, subcriteria: d.subcriteria.filter((s) => validKeys.has(s.key)) };
  });
}
