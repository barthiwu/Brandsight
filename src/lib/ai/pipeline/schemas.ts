import { z } from "zod";

export const DIMENSION_KEY_ENUM = z.enum([
  "positioning",
  "audience",
  "messaging",
  "content",
  "social",
  "visual",
  "digital",
  "competition",
]);

export const CONFIDENCE_ENUM = z.enum(["high", "medium", "low"]);
export const IMPACT_ENUM = z.enum(["low", "medium", "high"]);
export const DIFFICULTY_ENUM = z.enum(["low", "medium", "high"]);
export const SEVERITY_ENUM = z.enum(["low", "medium", "high", "critical"]);

// --- Stage 1: Normalize ---------------------------------------------------
export const NormalizedContextSchema = z.object({
  businessSummary: z.string(),
  audienceSummary: z.string(),
  positioningSummary: z.string(),
  objectivesSummary: z.string(),
  marketingSummary: z.string(),
  competitiveContext: z.string(),
});
export type NormalizedContext = z.infer<typeof NormalizedContextSchema>;

// --- Stage 3: Dimension analysis ------------------------------------------
export const SubcriterionScoreSchema = z.object({
  key: z.string(),
  /** null = genuinely unavailable from the evidence given; never guess a number. */
  score: z.number().min(0).max(100).nullable(),
  rationale: z.string(),
});

export const DimensionAnalysisSchema = z.object({
  dimensionKey: DIMENSION_KEY_ENUM,
  summary: z.string(),
  subcriteria: z.array(SubcriterionScoreSchema),
  evidenceObservedCount: z.number().int().min(0),
  evidenceProvidedCount: z.number().int().min(0),
  evidenceInferredCount: z.number().int().min(0),
  evidenceUnavailableCount: z.number().int().min(0),
});
export type DimensionAnalysis = z.infer<typeof DimensionAnalysisSchema>;

// `.length(8)` alone only guarantees eight ITEMS — it does not stop the
// model from returning e.g. "positioning" twice and omitting "content"
// while still totaling 8. The hardening pass requires exactly the 8 known
// dimension keys, each exactly once, no unknowns and no duplicates — so
// this adds an explicit uniqueness + completeness check on top of the
// per-item enum validation DIMENSION_KEY_ENUM already provides.
export const DimensionAnalysisBatchSchema = z.object({
  dimensions: z.array(DimensionAnalysisSchema).length(8),
}).superRefine((batch, ctx) => {
  const keys = batch.dimensions.map((d) => d.dimensionKey);
  const uniqueKeys = new Set(keys);

  if (uniqueKeys.size !== keys.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate dimension keys in AI output: expected each of the 8 dimensions exactly once, got [${keys.join(", ")}].`,
      path: ["dimensions"],
    });
  }

  const missing = DIMENSION_KEY_ENUM.options.filter((key) => !uniqueKeys.has(key));
  if (missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Missing required dimension(s) in AI output: ${missing.join(", ")}.`,
      path: ["dimensions"],
    });
  }
});

// --- Stage 4: Findings -----------------------------------------------------
export const FindingItemSchema = z.object({
  dimensionKey: DIMENSION_KEY_ENUM,
  type: z.enum(["strength", "weakness", "opportunity"]),
  title: z.string(),
  description: z.string(),
  severity: SEVERITY_ENUM.nullable(),
  impact: IMPACT_ENUM.nullable(),
  difficulty: DIFFICULTY_ENUM.nullable(),
  confidence: CONFIDENCE_ENUM,
  /**
   * Labels (e.g. "E3") of evidence-index entries that directly support
   * this finding, from the evidence list given in the Stage 4 prompt.
   * Resolved back to real `audit_evidence.id` values by
   * `resolveEvidenceRefs` — never trusted or stored verbatim, since the
   * model could hallucinate a label. Empty when no single evidence item
   * supports the finding (e.g. it synthesizes several).
   */
  evidenceRefs: z.array(z.string()).max(15),
});
export type FindingItem = z.infer<typeof FindingItemSchema>;

export const FindingsBatchSchema = z.object({
  findings: z.array(FindingItemSchema).min(1).max(40),
});

// --- Stage 5: Recommendations ----------------------------------------------
export const RecommendationItemSchema = z.object({
  dimensionKey: DIMENSION_KEY_ENUM,
  /** Index into the findings array passed into this stage. */
  findingIndex: z.number().int().min(0).nullable(),
  title: z.string(),
  description: z.string(),
  whyItMatters: z.string(),
  actionSteps: z.array(z.string()).min(1).max(8),
  impact: IMPACT_ENUM.nullable(),
  difficulty: DIFFICULTY_ENUM.nullable(),
  timeframe: z.string(),
});
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationsBatchSchema = z.object({
  recommendations: z.array(RecommendationItemSchema).min(1).max(30),
});

// --- Stage 7: Executive summary ---------------------------------------------
export const ExecutiveSummarySchema = z.object({
  summary: z.string(),
});

// --- Stage 8: Action plan ---------------------------------------------------
export const ActionPlanItemSchema = z.object({
  title: z.string(),
  whyItMatters: z.string(),
  actionSteps: z.array(z.string()).min(1).max(6),
  expectedImpact: IMPACT_ENUM,
  difficulty: DIFFICULTY_ENUM,
});

export const ActionPlanSchema = z.object({
  fixFirst: z.array(ActionPlanItemSchema).min(1).max(5),
  week1: z.array(ActionPlanItemSchema).max(5),
  week2: z.array(ActionPlanItemSchema).max(5),
  week3: z.array(ActionPlanItemSchema).max(5),
  week4: z.array(ActionPlanItemSchema).max(5),
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
