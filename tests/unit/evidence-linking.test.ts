import { describe, expect, it } from "vitest";
import { labelEvidenceRows, renderEvidenceIndex, resolveEvidenceRefs } from "@/lib/ai/pipeline/evidenceLinking";

const ROWS = [
  { id: "11111111-1111-1111-1111-111111111111", dimension: "positioning", source_type: "user_input", evidence_status: "provided", content: "We are a coffee shop." },
  { id: "22222222-2222-2222-2222-222222222222", dimension: "digital", source_type: "website", evidence_status: "observed", content: "Homepage has a clear CTA." },
  { id: "33333333-3333-3333-3333-333333333333", dimension: "social", source_type: "system", evidence_status: "unavailable", content: "No social profiles provided." },
];

describe("labelEvidenceRows", () => {
  it("assigns sequential E1, E2, ... labels in input order", () => {
    const labeled = labelEvidenceRows(ROWS);
    expect(labeled.map((l) => l.label)).toEqual(["E1", "E2", "E3"]);
    expect(labeled[1].id).toBe(ROWS[1].id);
  });

  it("returns an empty array for no evidence", () => {
    expect(labelEvidenceRows([])).toEqual([]);
  });
});

describe("renderEvidenceIndex", () => {
  it("includes every label and its content", () => {
    const text = renderEvidenceIndex(labelEvidenceRows(ROWS));
    expect(text).toContain("[E1]");
    expect(text).toContain("We are a coffee shop.");
    expect(text).toContain("[E3]");
  });

  it("renders an honest placeholder when there is no evidence at all", () => {
    expect(renderEvidenceIndex([])).toMatch(/no evidence/i);
  });
});

describe("resolveEvidenceRefs", () => {
  const labeled = labelEvidenceRows(ROWS);

  it("resolves known labels to their real evidence IDs", () => {
    expect(resolveEvidenceRefs(labeled, ["E1", "E3"])).toEqual([ROWS[0].id, ROWS[2].id]);
  });

  it("silently drops a hallucinated label instead of storing it", () => {
    expect(resolveEvidenceRefs(labeled, ["E1", "E99", "E7"])).toEqual([ROWS[0].id]);
  });

  it("de-duplicates repeated citations of the same label", () => {
    expect(resolveEvidenceRefs(labeled, ["E2", "E2", "E2"])).toEqual([ROWS[1].id]);
  });

  it("returns an empty array for missing, null, or empty refs", () => {
    expect(resolveEvidenceRefs(labeled, [])).toEqual([]);
    expect(resolveEvidenceRefs(labeled, undefined)).toEqual([]);
    expect(resolveEvidenceRefs(labeled, null)).toEqual([]);
  });

  it("never resolves a label against the wrong evidence set (cross-audit isolation)", () => {
    // A label like "E1" is only meaningful relative to the specific index
    // it was generated from; resolving it against an unrelated (e.g.
    // empty) index must not fall back to guessing.
    expect(resolveEvidenceRefs([], ["E1"])).toEqual([]);
  });
});
