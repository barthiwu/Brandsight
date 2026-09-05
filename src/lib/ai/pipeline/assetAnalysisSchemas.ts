import { z } from "zod";

/**
 * Pure schema/formatting logic for asset vision analysis (hardening pass
 * Known Issue #1), split out from assetAnalysis.ts so it can be unit
 * tested directly. assetAnalysis.ts itself transitively imports
 * "server-only" (via lib/ai/client.ts), which throws outside a server
 * component/test harness built for it — the same reason schemas.ts is
 * kept separate from client.ts elsewhere in this pipeline.
 */

const SubScoreSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  rationale: z.string(),
});

export const ImageAssetAnalysisSchema = z.object({
  visualHierarchy: SubScoreSchema,
  typography: SubScoreSchema,
  color: SubScoreSchema,
  composition: SubScoreSchema,
  ctaVisibility: SubScoreSchema,
  brandConsistency: SubScoreSchema,
  professionalism: SubScoreSchema,
  clarity: SubScoreSchema,
  recognizability: SubScoreSchema,
  summary: z.string(),
});
export type ImageAssetAnalysis = z.infer<typeof ImageAssetAnalysisSchema>;

export const DocumentAssetAnalysisSchema = z.object({
  extractedText: z.string(),
  structureSummary: z.string(),
  brandConsistencyNotes: z.string(),
  summary: z.string(),
});
export type DocumentAssetAnalysis = z.infer<typeof DocumentAssetAnalysisSchema>;

/** Renders a completed image analysis into human-readable evidence content. */
export function formatImageAnalysisForEvidence(fileName: string, a: ImageAssetAnalysis): string {
  const line = (label: string, s: { score: number | null; rationale: string }) =>
    `${label}: ${s.score ?? "n/a"} — ${s.rationale}`;
  return [
    `Vision analysis of uploaded asset "${fileName}":`,
    a.summary,
    line("Visual hierarchy", a.visualHierarchy),
    line("Typography", a.typography),
    line("Color", a.color),
    line("Composition", a.composition),
    line("CTA visibility", a.ctaVisibility),
    line("Brand consistency", a.brandConsistency),
    line("Professionalism", a.professionalism),
    line("Clarity", a.clarity),
    line("Recognizability", a.recognizability),
  ].join("\n");
}

/** Renders a completed document analysis into human-readable evidence content. */
export function formatDocumentAnalysisForEvidence(fileName: string, a: DocumentAssetAnalysis): string {
  return [
    `Document analysis of uploaded asset "${fileName}":`,
    a.summary,
    `Structure: ${a.structureSummary}`,
    `Brand consistency notes: ${a.brandConsistencyNotes}`,
    `Extracted text (excerpt): ${a.extractedText.slice(0, 1500)}`,
  ].join("\n");
}
