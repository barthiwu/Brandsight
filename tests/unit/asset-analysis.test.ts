import { describe, expect, it } from "vitest";
import {
  ImageAssetAnalysisSchema,
  DocumentAssetAnalysisSchema,
  formatImageAnalysisForEvidence,
  formatDocumentAnalysisForEvidence,
  type ImageAssetAnalysis,
  type DocumentAssetAnalysis,
} from "@/lib/ai/pipeline/assetAnalysisSchemas";

const VALID_SUBSCORE = { score: 72, rationale: "Because of X." };

const VALID_IMAGE_ANALYSIS: ImageAssetAnalysis = {
  visualHierarchy: VALID_SUBSCORE,
  typography: VALID_SUBSCORE,
  color: VALID_SUBSCORE,
  composition: VALID_SUBSCORE,
  ctaVisibility: { score: null, rationale: "No call to action is present in this asset." },
  brandConsistency: VALID_SUBSCORE,
  professionalism: VALID_SUBSCORE,
  clarity: VALID_SUBSCORE,
  recognizability: VALID_SUBSCORE,
  summary: "A clean, modern logo.",
};

const VALID_DOCUMENT_ANALYSIS: DocumentAssetAnalysis = {
  extractedText: "Brand Guidelines\nOur mission is...",
  structureSummary: "A 4-page PDF with a cover, mission statement, and color palette section.",
  brandConsistencyNotes: "Consistent use of the primary color across all sections.",
  summary: "A short internal brand guideline document.",
};

describe("ImageAssetAnalysisSchema", () => {
  it("accepts a fully-scored analysis", () => {
    expect(ImageAssetAnalysisSchema.safeParse(VALID_IMAGE_ANALYSIS).success).toBe(true);
  });

  it("accepts a null score with an explanatory rationale (never forces a guessed number)", () => {
    const result = ImageAssetAnalysisSchema.safeParse(VALID_IMAGE_ANALYSIS);
    expect(result.success).toBe(true);
    expect(result.data?.ctaVisibility.score).toBeNull();
  });

  it("rejects a score outside 0-100", () => {
    const bad = { ...VALID_IMAGE_ANALYSIS, color: { score: 150, rationale: "x" } };
    expect(ImageAssetAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing subcriterion", () => {
    const rest: Partial<ImageAssetAnalysis> = { ...VALID_IMAGE_ANALYSIS };
    delete rest.typography;
    expect(ImageAssetAnalysisSchema.safeParse(rest).success).toBe(false);
  });
});

describe("DocumentAssetAnalysisSchema", () => {
  it("accepts a well-formed document analysis", () => {
    expect(DocumentAssetAnalysisSchema.safeParse(VALID_DOCUMENT_ANALYSIS).success).toBe(true);
  });

  it("still accepts an honest empty-content report rather than requiring fabricated text", () => {
    const emptyDoc: DocumentAssetAnalysis = {
      extractedText: "",
      structureSummary: "This document appears to be a blank or unreadable scan.",
      brandConsistencyNotes: "Not assessable — no readable content.",
      summary: "Could not extract meaningful content from this PDF.",
    };
    expect(DocumentAssetAnalysisSchema.safeParse(emptyDoc).success).toBe(true);
  });
});

describe("formatImageAnalysisForEvidence", () => {
  it("includes the file name, summary, and every subcriterion", () => {
    const text = formatImageAnalysisForEvidence("logo.png", VALID_IMAGE_ANALYSIS);
    expect(text).toContain("logo.png");
    expect(text).toContain("A clean, modern logo.");
    expect(text).toContain("Visual hierarchy: 72");
    expect(text).toContain("CTA visibility: n/a");
  });
});

describe("formatDocumentAnalysisForEvidence", () => {
  it("includes structure, brand notes, and a bounded excerpt of extracted text", () => {
    const text = formatDocumentAnalysisForEvidence("guidelines.pdf", VALID_DOCUMENT_ANALYSIS);
    expect(text).toContain("guidelines.pdf");
    expect(text).toContain("A 4-page PDF");
    expect(text).toContain("Consistent use of the primary color");
    expect(text).toContain("Brand Guidelines");
  });

  it("truncates an extremely long extracted-text field rather than ballooning evidence size", () => {
    const long: DocumentAssetAnalysis = { ...VALID_DOCUMENT_ANALYSIS, extractedText: "x".repeat(5000) };
    const text = formatDocumentAnalysisForEvidence("big.pdf", long);
    expect(text.length).toBeLessThan(5000);
  });
});
