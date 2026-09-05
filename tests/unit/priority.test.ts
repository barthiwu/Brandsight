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
});
