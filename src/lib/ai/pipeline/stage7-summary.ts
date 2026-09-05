import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { ExecutiveSummarySchema } from "./schemas";
import type { FindingItem, RecommendationItem } from "./schemas";

/** Stage 7 — Executive Summary: a concise, professional synthesis for the top of the report. */
export async function runExecutiveSummaryStage(params: {
  brandName: string;
  overallScore: number | null;
  scoreBand: string | null;
  topFindings: FindingItem[];
  topRecommendations: RecommendationItem[];
}): Promise<string> {
  const context = [
    `Business: ${params.brandName}`,
    `Overall BrandSight score: ${params.overallScore ?? "not fully scorable"} ${params.scoreBand ? `(${params.scoreBand})` : ""}`,
    `Top findings:\n${params.topFindings.map((f) => `- [${f.type}] ${f.title}`).join("\n") || "(none)"}`,
    `Top recommendations:\n${params.topRecommendations.map((r) => `- ${r.title}`).join("\n") || "(none)"}`,
  ].join("\n\n");

  const instructions = `${BASE_SYSTEM_RULES}

Task: Write a 3-5 sentence executive summary for this marketing audit, in the voice of a calm, expert consultant. Open with an honest overall assessment, note the strongest asset, name the most important thing to fix, and end with a forward-looking but realistic note. No bullet points, no headers — plain prose.`;

  const result = await callStructuredStage({
    stage: "executive_summary",
    schema: ExecutiveSummarySchema,
    schemaName: "executive_summary",
    instructions,
    input: wrapExternalData("summary_context", context),
  });

  return result.summary;
}
