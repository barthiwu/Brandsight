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

export const DimensionAnalysisBatchSchema = z.object({
  dimensions: z.array(DimensionAnalysisSchema).length(8),
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
