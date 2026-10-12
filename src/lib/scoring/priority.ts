import type { DifficultyLevel, ImpactLevel, SeverityLevel } from "@/types/database";

/**
 * Deterministic priority scoring for findings and recommendations
 * (spec §51 Stage 6: "Rank recommendations using impact/difficulty/urgency").
 * The AI supplies qualitative impact/difficulty/severity labels; this
 * module is what turns them into the numeric `priority_score` used to
 * order the report and build the 30-day plan's "Fix First" section.
 *
 * Formula: priority = (impact * 2 + severity) - (difficulty * 0.5)
 * on a 1-3 scale per factor, giving a 0.5-8.5 range where higher = more
 * urgent to act on. Low-difficulty, high-impact, high-severity items
 * float to the top; the small difficulty penalty (rather than a divisor)
 * keeps "hard but very important" items from being buried.
 */

const LEVEL_WEIGHT: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function computePriorityScore(input: {
  impact?: ImpactLevel | null;
  difficulty?: DifficultyLevel | null;
  severity?: SeverityLevel | null;
}): number {
  const impact = LEVEL_WEIGHT[input.impact ?? "medium"];
  const difficulty = LEVEL_WEIGHT[input.difficulty ?? "medium"];
  const severity = Math.min(LEVEL_WEIGHT[input.severity ?? "medium"], 3);

  const raw = impact * 2 + severity - difficulty * 0.5;
  return Math.round(raw * 100) / 100;
}

export function rankByPriority<T extends { priority_score?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
}

/**
 * Attaches each finding's own priority_score (matched by array index —
 * `priorityScores` must be the same length and order as `findings`,
 * i.e. computed from the same, unfiltered array) BEFORE filtering out
 * "opportunity" findings, then ranks what's left.
 *
 * The order matters and fixes a real bug: runPipeline.ts used to attach
 * priority_score via `findings.filter(...).map((f, i) => ...)`, where
 * `i` was the *post-filter* index — no longer aligned with the
 * separately-computed, full-length findingRows array it was reading
 * from. Since Stage 4 routinely interleaves "opportunity" findings with
 * strengths/weaknesses, this wasn't a rare edge case: any time an
 * opportunity finding sat earlier in the array than a strength/weakness,
 * every finding after it silently inherited some *other* finding's
 * score, corrupting what counted as the audit's top strengths/weaknesses
 * (and, downstream, what Stage 7's executive summary highlighted as
 * "What's Working" / "What Needs Attention").
 */
export function rankStrengthsAndWeaknesses<F extends { type: string }>(
  findings: F[],
  priorityScores: (number | null | undefined)[]
): (F & { priority_score: number })[] {
  const withScores = findings.map((f, i) => ({ ...f, priority_score: priorityScores[i] ?? 0 }));
  return rankByPriority(withScores.filter((f) => f.type !== "opportunity"));
}
