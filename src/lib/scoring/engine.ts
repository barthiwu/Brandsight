import type { ConfidenceLevel, DimensionKey } from "@/types/database";
import {
  ALL_DIMENSION_KEYS,
  DIMENSION_SUBCRITERIA,
  DIMENSION_WEIGHTS,
  getScoreBand,
} from "./dimensions";

/**
 * Deterministic scoring engine (spec §38-49). The AI pipeline scores each
 * subcriterion from evidence; this module is the ONLY place that turns
 * those subcriteria into dimension scores and the dimension scores into
 * the overall BrandSight score. The AI never invents a dimension or
 * overall score directly.
 */

export interface SubcriterionInput {
  key: string;
  /** null/undefined = "unavailable" (spec: never silently convert unknown to zero). */
  score: number | null | undefined;
}

export interface DimensionScoreResult {
  dimensionKey: DimensionKey;
  /** null when every subcriterion for this dimension was unavailable. */
  score: number | null;
  /** Sum of weights actually used (after renormalization), 0-1. */
  coveredWeight: number;
  subcriteriaUsed: number;
  subcriteriaTotal: number;
}

/**
 * Weighted-average a dimension's subcriteria, renormalizing over only the
 * subcriteria that have a score. If NONE are available, the dimension is
 * unscorable (returns score: null) rather than defaulting to 0.
 */
export function computeDimensionScore(
  dimensionKey: DimensionKey,
  subcriteria: SubcriterionInput[]
): DimensionScoreResult {
  const config = DIMENSION_SUBCRITERIA[dimensionKey];
  const byKey = new Map(subcriteria.map((s) => [s.key, s.score]));

  let weightedSum = 0;
  let coveredWeight = 0;
  let subcriteriaUsed = 0;

  for (const criterion of config) {
    const raw = byKey.get(criterion.key);
    if (raw === null || raw === undefined || Number.isNaN(raw)) continue;
    const clamped = clampScore(raw);
    weightedSum += clamped * criterion.weight;
    coveredWeight += criterion.weight;
    subcriteriaUsed += 1;
  }

  if (coveredWeight === 0) {
    return {
      dimensionKey,
      score: null,
      coveredWeight: 0,
      subcriteriaUsed: 0,
      subcriteriaTotal: config.length,
    };
  }

  const score = Math.round(weightedSum / coveredWeight);

  return {
    dimensionKey,
    score,
    coveredWeight,
    subcriteriaUsed,
    subcriteriaTotal: config.length,
  };
}

export interface OverallScoreResult {
  /** null only if every dimension was unscorable. */
  overallScore: number | null;
  band: string | null;
  coveredWeight: number;
  dimensionsUsed: DimensionKey[];
}

/**
 * Weighted-average the eight dimension scores into the overall BrandSight
 * score (spec §47). Dynamically renormalizes over dimensions that were
 * actually scorable, so a genuinely-unscorable dimension (e.g. no
 * competitor data at all) reduces coverage rather than being treated as
 * a zero.
 */
export function computeOverallScore(
  dimensionScores: Partial<Record<DimensionKey, number | null>>
): OverallScoreResult {
  let weightedSum = 0;
  let coveredWeight = 0;
  const dimensionsUsed: DimensionKey[] = [];

  for (const key of ALL_DIMENSION_KEYS) {
    const score = dimensionScores[key];
    if (score === null || score === undefined) continue;
    const weight = DIMENSION_WEIGHTS[key];
    weightedSum += clampScore(score) * weight;
    coveredWeight += weight;
    dimensionsUsed.push(key);
  }

  if (coveredWeight === 0) {
    return { overallScore: null, band: null, coveredWeight: 0, dimensionsUsed: [] };
  }

  const overallScore = Math.round(weightedSum / coveredWeight);

  return {
    overallScore,
    band: getScoreBand(overallScore),
    coveredWeight,
    dimensionsUsed,
  };
}

// ---------------------------------------------------------------------------
// Confidence (spec §49)
// ---------------------------------------------------------------------------

export interface EvidenceCounts {
  observed: number;
  provided: number;
  inferred: number;
  unavailable: number;
}

/**
 * High: meaningful objective evidence was successfully gathered (website,
 * social, assets) alongside user input, and unavailable evidence is rare.
 * Medium: mostly/only the user's own description, little or no
 * independently observed evidence.
 * Low: little or no evidence of any kind, or evidence is dominated by
 * "unavailable" markers.
 */
export function calculateConfidence(counts: EvidenceCounts): ConfidenceLevel {
  const total = counts.observed + counts.provided + counts.inferred + counts.unavailable;
  if (total === 0) return "low";

  const unavailableRatio = counts.unavailable / total;
  if (unavailableRatio >= 0.6) return "low";

  if (counts.observed > 0 && unavailableRatio < 0.25) return "high";

  if (counts.provided > 0) return "medium";

  return "low";
}

/** Aggregate the eight per-dimension confidences into one overall confidence. */
export function calculateOverallConfidence(
  confidences: ConfidenceLevel[]
): ConfidenceLevel {
  if (confidences.length === 0) return "low";
  const weight: Record<ConfidenceLevel, number> = { high: 2, medium: 1, low: 0 };
  const avg = confidences.reduce((sum, c) => sum + weight[c], 0) / confidences.length;
  if (avg >= 1.5) return "high";
  if (avg >= 0.75) return "medium";
  return "low";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
