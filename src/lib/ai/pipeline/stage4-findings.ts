import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { FindingsBatchSchema, type FindingItem, type DimensionAnalysis } from "./schemas";
import { renderEvidenceIndex, type LabeledEvidence } from "./evidenceLinking";

/**
 * Stage 4 — Findings: extract strengths, weaknesses, and opportunities
 * from the scored dimensions, each cited against the labeled evidence
 * index so the report can show *why* a finding was reached (hardening
 * pass Known Issue #2 — evidence traceability).
 */
export async function runFindingsStage(
  dimensionAnalyses: DimensionAnalysis[],
  evidence: LabeledEvidence[]
): Promise<FindingItem[]> {
  const context = dimensionAnalyses
    .map(
      (d) =>
        `${d.dimensionKey}: ${d.summary}\nSubcriteria: ${d.subcriteria
          .map((s) => `${s.key}=${s.score ?? "unavailable"} (${s.rationale})`)
          .join("; ")}`
    )
    .join("\n\n");

  const evidenceIndex = renderEvidenceIndex(evidence);

  const instructions = `${BASE_SYSTEM_RULES}

Task: From the per-dimension analysis below, extract concrete findings — a mix of strengths, weaknesses, and opportunities. Every finding must be traceable to something in the analysis (do not introduce topics not covered there). Aim for 2-5 findings per dimension where the evidence supports it; it's fine to have fewer for a dimension with little evidence, and you may skip strengths/weaknesses entirely for a dimension marked unavailable across the board. Assign severity, impact, and difficulty honestly — leave them null if you can't judge from the evidence.

You are also given a labeled evidence index (evidence_index below). For every finding, set "evidenceRefs" to the label(s) — e.g. "E3" — of every evidence-index entry that directly supports it. Only use labels that literally appear in the evidence_index; never invent one, and never cite a label from a different dimension than the finding unless that evidence item genuinely applies across dimensions. If a finding synthesizes the analysis rather than tracing to one specific evidence item, leave evidenceRefs as an empty array — do not guess a citation just to fill the field.`;

  const result = await callStructuredStage({
    stage: "findings",
    schema: FindingsBatchSchema,
    schemaName: "findings_batch",
    instructions,
    input: `${wrapExternalData("dimension_analysis", context)}\n\n${wrapExternalData("evidence_index", evidenceIndex)}`,
  });

  return result.findings;
}
