import { describe, expect, it } from "vitest";
import { computePriorityScore, rankByPriority } from "@/lib/scoring/priority";

describe("computePriorityScore", () => {
  it("ranks high-impact, low-difficulty items above low-impact, high-difficulty ones", () => {
    const easy = computePriorityScore({ impact: "high", difficulty: "low", severity: "high" });
    const hard = computePriorityScore({ impact: "low", difficulty: "high", severity: "low" });
    expect(easy).toBeGreaterThan(hard);
  });

  it("a high-impact hard item still outranks a low-impact easy item", () => {
    const hardButImportant = computePriorityScore({ impact: "high", difficulty: "high", severity: "high" });
    const easyButMinor = computePriorityScore({ impact: "low", difficulty: "low", severity: "low" });
    expect(hardButImportant).toBeGreaterThan(easyButMinor);
  });

  it("defaults missing fields to medium rather than throwing", () => {
    expect(() => computePriorityScore({})).not.toThrow();
  });
});

describe("rankByPriority", () => {
  it("sorts descending by priority_score, treating missing scores as 0", () => {
    const items = [
      { id: "a", priority_score: 3 },
      { id: "b", priority_score: 9 },
      { id: "c", priority_score: null },
      { id: "d", priority_score: 5 },
    ];
    const ranked = rankByPriority(items);
    expect(ranked.map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const items = [{ priority_score: 1 }, { priority_score: 2 }];
    const copy = [...items];
    rankByPriority(items);
    expect(items).toEqual(copy);
  });

  // Tie-breaking: Array.prototype.sort has been spec-guaranteed stable since
  // ES2019, so items with equal priority_score must keep their relative
  // input order rather than being reshuffled arbitrarily. This matters for
  // the report and 30-day plan, which would otherwise show a different
  // "Fix First" ordering on every render for tied items.
  it("breaks ties by preserving original input order (stable sort)", () => {
    const items = [
      { id: "first", priority_score: 5 },
      { id: "second", priority_score: 5 },
      { id: "third", priority_score: 5 },
    ];
    const ranked = rankByPriority(items);
    expect(ranked.map((i) => i.id)).toEqual(["first", "second", "third"]);
  });

  it("preserves original order among ties even when interleaved with distinct scores", () => {
    const items = [
      { id: "tie-a", priority_score: 5 },
      { id: "high", priority_score: 9 },
      { id: "tie-b", priority_score: 5 },
      { id: "low", priority_score: 1 },
      { id: "tie-c", priority_score: 5 },
    ];
    const ranked = rankByPriority(items);
    expect(ranked.map((i) => i.id)).toEqual(["high", "tie-a", "tie-b", "tie-c", "low"]);
  });

  it("treats multiple null/missing scores as tied at 0 and preserves their relative order", () => {
    const items = [
      { id: "a", priority_score: null },
      { id: "b", priority_score: 2 },
      { id: "c", priority_score: undefined },
    ];
    const ranked = rankByPriority(items);
    expect(ranked.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});

describe("computePriorityScore tie-breaking inputs", () => {
  it("produces identical scores for identical impact/difficulty/severity inputs (deterministic, not random)", () => {
    const a = computePriorityScore({ impact: "high", difficulty: "medium", severity: "medium" });
    const b = computePriorityScore({ impact: "high", difficulty: "medium", severity: "medium" });
    expect(a).toBe(b);
  });

  it("critical severity is clamped to the same weight as high (severity scale is only low/medium/high/critical capped at 3)", () => {
    const high = computePriorityScore({ impact: "medium", difficulty: "medium", severity: "high" });
    const critical = computePriorityScore({ impact: "medium", difficulty: "medium", severity: "critical" });
    expect(critical).toBe(high);
  });
});
