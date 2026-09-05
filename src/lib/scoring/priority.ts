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
