import { describe, expect, it } from "vitest";
import {
  AUDIT_QUESTIONS,
  AUDIT_SECTIONS,
  questionsForSection,
  requiredQuestionKeys,
  isSectionComplete,
} from "@/lib/questions/config";

describe("AUDIT_QUESTIONS", () => {
  it("has a unique question_key for every question", () => {
    const keys = AUDIT_QUESTIONS.map((q) => q.question_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("assigns every question to one of the declared sections", () => {
    for (const q of AUDIT_QUESTIONS) {
      expect(AUDIT_SECTIONS).toContain(q.section);
    }
  });

  it("gives every select/multiselect question at least one option", () => {
    for (const q of AUDIT_QUESTIONS) {
      if (q.type === "select" || q.type === "multiselect") {
        expect(q.options?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("never marks the optional competitors question as required (spec §35 — competitors are never forced)", () => {
    const competitors = AUDIT_QUESTIONS.find((q) => q.question_key === "competitors");
    expect(competitors?.required).toBe(false);
    expect(competitors?.quickAudit).toBe("optional");
  });
});

describe("questionsForSection", () => {
  it("returns only questions belonging to the requested section", () => {
    for (const section of AUDIT_SECTIONS) {
      const qs = questionsForSection(section);
      expect(qs.every((q) => q.section === section)).toBe(true);
    }
  });

  it("covers every section with at least one question", () => {
    for (const section of AUDIT_SECTIONS) {
      expect(questionsForSection(section).length).toBeGreaterThan(0);
    }
  });
});

describe("requiredQuestionKeys", () => {
  it("returns exactly the keys of questions marked required", () => {
    const expected = AUDIT_QUESTIONS.filter((q) => q.required).map((q) => q.question_key);
    expect(requiredQuestionKeys().sort()).toEqual(expected.sort());
  });
});

describe("isSectionComplete", () => {
  it("is false when a required answer is missing, empty, or null", () => {
    expect(isSectionComplete("objectives", {})).toBe(false);
    expect(isSectionComplete("objectives", { primary_objective: "" })).toBe(false);
    expect(isSectionComplete("objectives", { primary_objective: null })).toBe(false);
  });

  it("is true once every required question in the section is answered", () => {
    const answers = {
      primary_objective: "more_leads",
      biggest_marketing_challenge: "Not enough qualified leads.",
    };
    expect(isSectionComplete("objectives", answers)).toBe(true);
  });

  it("ignores optional questions when deciding completeness", () => {
    // "competitors" section has no required questions at all.
    expect(isSectionComplete("competitors", {})).toBe(true);
  });

  it("does not require answers from other sections", () => {
    const answers = {
      primary_objective: "more_leads",
      biggest_marketing_challenge: "Not enough qualified leads.",
      // no "business" section answers present
    };
    expect(isSectionComplete("objectives", answers)).toBe(true);
    expect(isSectionComplete("business", answers)).toBe(false);
  });
});
