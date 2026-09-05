import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { RecommendationsBatchSchema, type RecommendationItem, type FindingItem } from "./schemas";

/** Stage 5 — Recommendations: generate practical actions tied to specific findings. */
export async function runRecommendationsStage(findings: FindingItem[]): Promise<RecommendationItem[]> {
  const indexed = findings.map((f, i) => `[${i}] (${f.dimensionKey}, ${f.type}) ${f.title}: ${f.description}`).join("\n");

  const instructions = `${BASE_SYSTEM_RULES}

Task: For each weakness or opportunity finding below (skip pure strengths — those don't need a recommendation), write one practical, specific recommendation the business owner can act on. Reference the finding by its index number in "findingIndex". A recommendation must relate directly to its finding — no generic "post more on social media" advice untethered from what was actually found. Include concrete action steps (2-6 short, doable steps), a plain-language "why it matters", and an honest impact/difficulty/timeframe estimate. It's fine to combine closely related findings into one recommendation if that reads better — reference the most relevant finding's index.`;

  const result = await callStructuredStage({
    stage: "recommendations",
    schema: RecommendationsBatchSchema,
    schemaName: "recommendations_batch",
    instructions,
    input: wrapExternalData("findings", indexed),
  });

  return result.recommendations;
}
