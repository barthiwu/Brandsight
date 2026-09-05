import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { ActionPlanSchema, type ActionPlan, type RecommendationItem } from "./schemas";

/** Stage 8 — Action Plan: turn the ranked recommendations into a concrete 30-day plan. */
export async function runActionPlanStage(rankedRecommendations: RecommendationItem[]): Promise<ActionPlan> {
  const context = rankedRecommendations
    .map((r, i) => `[${i}] (${r.dimensionKey}) ${r.title} — impact:${r.impact ?? "?"} difficulty:${r.difficulty ?? "?"} timeframe:${r.timeframe}\n${r.description}`)
    .join("\n\n");

  const instructions = `${BASE_SYSTEM_RULES}

Task: Using the recommendations below (already ranked by priority, highest first), build a 30-day action plan. Put the 1-3 absolute highest-leverage, most urgent items in "fixFirst". Distribute the rest sensibly across week1-week4, front-loading easier/higher-impact work and leaving harder or lower-priority work for later weeks. Not every week needs entries if there isn't enough material — never invent recommendations that weren't given to you. Each plan item needs a short title, why it matters, concrete action steps, and an honest impact/difficulty estimate.`;

  return callStructuredStage({
    stage: "action_plan",
    schema: ActionPlanSchema,
    schemaName: "action_plan",
    instructions,
    input: wrapExternalData("ranked_recommendations", context),
  });
}
