import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { FindingsBatchSchema, type FindingItem, type DimensionAnalysis } from "./schemas";

/** Stage 4 — Findings: extract strengths, weaknesses, and opportunities from the scored dimensions. */
export async function runFindingsStage(dimensionAnalyses: DimensionAnalysis[]): Promise<FindingItem[]> {
  const context = dimensionAnalyses
    .map(
      (d) =>
        `${d.dimensionKey}: ${d.summary}\nSubcriteria: ${d.subcriteria
          .map((s) => `${s.key}=${s.score ?? "unavailable"} (${s.rationale})`)
          .join("; ")}`
    )
    .join("\n\n");

  const instructions = `${BASE_SYSTEM_RULES}

Task: From the per-dimension analysis below, extract concrete findings — a mix of strengths, weaknesses, and opportunities. Every finding must be traceable to something in the analysis (do not introduce topics not covered there). Aim for 2-5 findings per dimension where the evidence supports it; it's fine to have fewer for a dimension with little evidence, and you may skip strengths/weaknesses entirely for a dimension marked unavailable across the board. Assign severity, impact, and difficulty honestly — leave them null if you can't judge from the evidence.`;

  const result = await callStructuredStage({
    stage: "findings",
    schema: FindingsBatchSchema,
    schemaName: "findings_batch",
    instructions,
    input: wrapExternalData("dimension_analysis", context),
  });

  return result.findings;
}
