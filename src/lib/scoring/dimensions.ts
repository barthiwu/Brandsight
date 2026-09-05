import type { DimensionKey } from "@/types/database";

export interface SubcriterionConfig {
  key: string;
  label: string;
  /** Fraction of the dimension's score, 0-1. All weights per dimension sum to 1. */
  weight: number;
}

/**
 * Weighted subcriteria per dimension, transcribed verbatim from spec
 * §39-46. The AI pipeline scores each subcriterion (or marks it
 * unavailable); the scoring engine (engine.ts) turns those into the
 * deterministic dimension score — the AI never invents the dimension
 * score directly (spec §38).
 */
export const DIMENSION_SUBCRITERIA: Record<DimensionKey, SubcriterionConfig[]> = {
  positioning: [
    { key: "value_proposition_clarity", label: "Value proposition clarity", weight: 0.25 },
    { key: "audience_specificity", label: "Audience specificity", weight: 0.2 },
    { key: "problem_clarity", label: "Problem clarity", weight: 0.2 },
    { key: "differentiation", label: "Differentiation", weight: 0.25 },
    { key: "offer_clarity", label: "Offer clarity", weight: 0.1 },
  ],
  audience: [
    { key: "customer_definition", label: "Customer definition", weight: 0.3 },
    { key: "customer_problem_understanding", label: "Customer problem understanding", weight: 0.25 },
    { key: "audience_specificity", label: "Audience specificity", weight: 0.2 },
    { key: "customer_motivation", label: "Customer motivation", weight: 0.15 },
    { key: "segment_alignment", label: "Segment alignment", weight: 0.1 },
  ],
  messaging: [
    { key: "clarity", label: "Clarity", weight: 0.25 },
    { key: "value_communication", label: "Value communication", weight: 0.25 },
    { key: "differentiation", label: "Differentiation", weight: 0.2 },
    { key: "consistency", label: "Consistency", weight: 0.15 },
    { key: "cta_quality", label: "CTA quality", weight: 0.15 },
  ],
  content: [
    { key: "strategic_relevance", label: "Strategic relevance", weight: 0.25 },
    { key: "audience_alignment", label: "Audience alignment", weight: 0.2 },
    { key: "content_variety", label: "Content variety", weight: 0.15 },
    { key: "value_education", label: "Value/education", weight: 0.15 },
    { key: "promotional_balance", label: "Promotional balance", weight: 0.1 },
    { key: "consistency", label: "Consistency", weight: 0.15 },
  ],
  social: [
    { key: "profile_optimization", label: "Profile optimization", weight: 0.2 },
    { key: "content_quality", label: "Content quality", weight: 0.25 },
    { key: "consistency", label: "Consistency", weight: 0.15 },
    { key: "engagement_signals", label: "Engagement signals", weight: 0.15 },
    { key: "brand_consistency", label: "Brand consistency", weight: 0.15 },
    { key: "cta_conversion_path", label: "CTA/conversion path", weight: 0.1 },
  ],
  visual: [
    { key: "visual_consistency", label: "Visual consistency", weight: 0.25 },
    { key: "professionalism", label: "Professionalism", weight: 0.2 },
    { key: "typography", label: "Typography", weight: 0.15 },
    { key: "color_usage", label: "Color usage", weight: 0.15 },
    { key: "imagery", label: "Imagery", weight: 0.15 },
    { key: "brand_recognizability", label: "Brand recognizability", weight: 0.1 },
  ],
  digital: [
    { key: "website_clarity", label: "Website clarity", weight: 0.2 },
    { key: "value_proposition", label: "Value proposition", weight: 0.2 },
    { key: "conversion_path", label: "Conversion path", weight: 0.2 },
    { key: "trust_signals", label: "Trust signals", weight: 0.15 },
    { key: "contact_accessibility", label: "Contact accessibility", weight: 0.1 },
    { key: "user_experience", label: "User experience", weight: 0.15 },
  ],
  competition: [
    { key: "differentiation", label: "Differentiation", weight: 0.3 },
    { key: "competitor_clarity", label: "Competitor clarity", weight: 0.2 },
    { key: "positioning_strength", label: "Positioning strength", weight: 0.25 },
    { key: "competitive_opportunity", label: "Competitive opportunity", weight: 0.25 },
  ],
};

/** Overall BrandSight score weights per dimension (spec §47). Sums to 1.00. */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  positioning: 0.15,
  audience: 0.1,
  messaging: 0.15,
  content: 0.15,
  social: 0.1,
  visual: 0.1,
  digital: 0.15,
  competition: 0.1,
};

export const ALL_DIMENSION_KEYS: DimensionKey[] = [
  "positioning",
  "audience",
  "messaging",
  "content",
  "social",
  "visual",
  "digital",
  "competition",
];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  positioning: "Brand Positioning",
  audience: "Target Audience",
  messaging: "Brand Messaging",
  content: "Content Strategy",
  social: "Social Media Presence",
  visual: "Visual Brand",
  digital: "Digital Presence",
  competition: "Competitive Position",
};

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
}

/** Score bands, spec §48. */
export const SCORE_BANDS: ScoreBand[] = [
  { min: 90, max: 100, label: "Exceptional" },
  { min: 80, max: 89, label: "Strong" },
  { min: 70, max: 79, label: "Good Foundation" },
  { min: 60, max: 69, label: "Needs Improvement" },
  { min: 40, max: 59, label: "Weak" },
  { min: 0, max: 39, label: "Critical" },
];

export function getScoreBand(score: number): string {
  const band = SCORE_BANDS.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? "Unscored";
}
