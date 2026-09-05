import { describe, expect, it } from "vitest";
import {
  computeDimensionScore,
  computeOverallScore,
  calculateConfidence,
  calculateOverallConfidence,
} from "@/lib/scoring/engine";
import { DIMENSION_SUBCRITERIA, DIMENSION_WEIGHTS, getScoreBand } from "@/lib/scoring/dimensions";

describe("computeDimensionScore", () => {
  it("weights subcriteria correctly when all are present", () => {
    // positioning weights: value_proposition_clarity .25, audience_specificity .20,
    // problem_clarity .20, differentiation .25, offer_clarity .10
    const result = computeDimensionScore("positioning", [
      { key: "value_proposition_clarity", score: 80 },
      { key: "audience_specificity", score: 80 },
      { key: "problem_clarity", score: 80 },
      { key: "differentiation", score: 80 },
      { key: "offer_clarity", score: 80 },
    ]);
    expect(result.score).toBe(80);
    expect(result.coveredWeight).toBeCloseTo(1);
    expect(result.subcriteriaUsed).toBe(5);
  });

  it("renormalizes over available subcriteria instead of zero-filling missing ones", () => {
    // Only differentiation (.25) and offer_clarity (.10) available, both 100.
    // Renormalized: (100*.25 + 100*.10) / (.25+.10) = 100
    const result = computeDimensionScore("positioning", [
      { key: "differentiation", score: 100 },
      { key: "offer_clarity", score: 100 },
    ]);
    expect(result.score).toBe(100);
    expect(result.coveredWeight).toBeCloseTo(0.35);
    expect(result.subcriteriaUsed).toBe(2);
  });

  it("returns null (not zero) when no subcriteria are available", () => {
    const result = computeDimensionScore("competition", []);
    expect(result.score).toBeNull();
    expect(result.coveredWeight).toBe(0);
  });

  it("ignores null/undefined/NaN subcriteria scores as unavailable, not zero", () => {
    const result = computeDimensionScore("audience", [
      { key: "customer_definition", score: 90 },
      { key: "customer_problem_understanding", score: null },
      { key: "audience_specificity", score: undefined },
      { key: "customer_motivation", score: NaN },
      { key: "segment_alignment", score: 90 },
    ]);
    // Only customer_definition (.30) and segment_alignment (.10) count -> avg still 90
    expect(result.score).toBe(90);
    expect(result.subcriteriaUsed).toBe(2);
  });

  it("clamps out-of-range scores into 0-100", () => {
    const result = computeDimensionScore("competition", [
      { key: "differentiation", score: 150 },
      { key: "competitor_clarity", score: -20 },
      { key: "positioning_strength", score: 50 },
      { key: "competitive_opportunity", score: 50 },
    ]);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
  });

  it("every dimension's subcriteria weights sum to 1", () => {
    for (const key of Object.keys(DIMENSION_SUBCRITERIA) as (keyof typeof DIMENSION_SUBCRITERIA)[]) {
      const sum = DIMENSION_SUBCRITERIA[key].reduce((acc, s) => acc + s.weight, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});

describe("computeOverallScore", () => {
  it("dimension weights sum to 1", () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("computes a straightforward weighted average when all dimensions are scored", () => {
    const result = computeOverallScore({
      positioning: 80,
      audience: 80,
      messaging: 80,
      content: 80,
      social: 80,
      visual: 80,
      digital: 80,
      competition: 80,
    });
    expect(result.overallScore).toBe(80);
    expect(result.band).toBe("Strong");
    expect(result.dimensionsUsed).toHaveLength(8);
  });

  it("dynamically renormalizes when a dimension is genuinely unscorable, never treating it as zero", () => {
    // Drop 'competition' (weight .10) entirely rather than scoring it 0.
    const result = computeOverallScore({
      positioning: 90,
      audience: 90,
      messaging: 90,
      content: 90,
      social: 90,
      visual: 90,
      digital: 90,
      competition: null,
    });
    expect(result.overallScore).toBe(90);
    expect(result.dimensionsUsed).toHaveLength(7);
    expect(result.coveredWeight).toBeCloseTo(0.9, 5);
  });

  it("returns null when every dimension is unscorable", () => {
    const result = computeOverallScore({});
    expect(result.overallScore).toBeNull();
    expect(result.band).toBeNull();
  });

  it("a low-weight unscorable dimension changes the result less than a high-weight one", () => {
    const dropLowWeight = computeOverallScore({
      positioning: 100,
      audience: 50, // weight .10
      messaging: 100,
      content: 100,
      social: 100,
      visual: 100,
      digital: 100,
      competition: 100,
    });
    const dropHighWeight = computeOverallScore({
      positioning: 50, // weight .15
      audience: 100,
      messaging: 100,
      content: 100,
      social: 100,
      visual: 100,
      digital: 100,
      competition: 100,
    });
    expect(dropHighWeight.overallScore!).toBeLessThan(dropLowWeight.overallScore!);
  });
});

describe("getScoreBand", () => {
  it.each([
    [100, "Exceptional"],
    [90, "Exceptional"],
    [89, "Strong"],
    [80, "Strong"],
    [79, "Good Foundation"],
    [70, "Good Foundation"],
    [69, "Needs Improvement"],
    [60, "Needs Improvement"],
    [59, "Weak"],
    [40, "Weak"],
    [39, "Critical"],
    [0, "Critical"],
  ])("scores %i as %s", (score, label) => {
    expect(getScoreBand(score)).toBe(label);
  });
});

describe("calculateConfidence", () => {
  it("is low with zero evidence", () => {
    expect(calculateConfidence({ observed: 0, provided: 0, inferred: 0, unavailable: 0 })).toBe("low");
  });

  it("is high with strong observed evidence and little unavailable", () => {
    expect(calculateConfidence({ observed: 5, provided: 3, inferred: 1, unavailable: 0 })).toBe("high");
  });

  it("is medium when only user-provided description exists", () => {
    expect(calculateConfidence({ observed: 0, provided: 4, inferred: 0, unavailable: 0 })).toBe("medium");
  });

  it("is low when evidence is dominated by unavailable markers", () => {
    expect(calculateConfidence({ observed: 1, provided: 1, inferred: 0, unavailable: 5 })).toBe("low");
  });
});

describe("calculateOverallConfidence", () => {
  it("averages per-dimension confidences", () => {
    expect(calculateOverallConfidence(["high", "high", "high"])).toBe("high");
    expect(calculateOverallConfidence(["low", "low", "low"])).toBe("low");
    expect(calculateOverallConfidence(["high", "low"])).toBe("medium");
  });

  it("defaults to low with no input", () => {
    expect(calculateOverallConfidence([])).toBe("low");
  });
});
