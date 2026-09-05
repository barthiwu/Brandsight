import type OpenAI from "openai";
import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES } from "@/lib/ai/prompts";
import {
  ImageAssetAnalysisSchema,
  DocumentAssetAnalysisSchema,
  type ImageAssetAnalysis,
  type DocumentAssetAnalysis,
} from "./assetAnalysisSchemas";

export {
  ImageAssetAnalysisSchema,
  DocumentAssetAnalysisSchema,
  formatImageAnalysisForEvidence,
  formatDocumentAnalysisForEvidence,
  type ImageAssetAnalysis,
  type DocumentAssetAnalysis,
} from "./assetAnalysisSchemas";

/**
 * Real OpenAI-vision asset analysis (hardening pass Known Issue #1).
 *
 * The original build never looked at uploaded brand assets at all — it
 * recorded a placeholder evidence row that just named the uploaded files
 * ("3 brand asset(s) uploaded for visual review: logo.png, ...") and let
 * the dimension-analysis model treat that as if it had seen them, which it
 * never had. This module actually sends each image to the model as image
 * input, and each PDF as file input, and asks for a structured, honest
 * critique — never a fabricated one.
 */

const IMAGE_ANALYSIS_INSTRUCTIONS = `${BASE_SYSTEM_RULES}

Task: You are shown one uploaded brand asset image (a logo, screenshot, ad creative, social graphic, or similar). Rate each of the following on a 0-100 scale ONLY where the image gives you enough to judge; otherwise set the score to null and use the rationale to say why (e.g. "not applicable — this asset has no call to action"):
- visualHierarchy: does the eye know where to look first, second, third?
- typography: font choices, legibility, consistency
- color: palette cohesion and contrast
- composition: layout balance and use of space
- ctaVisibility: visibility/clarity of any call to action (null if none is present)
- brandConsistency: internal consistency of THIS asset alone — you have not seen the brand's other materials, so say that explicitly rather than implying a cross-asset comparison
- professionalism: overall production quality
- clarity: is the asset's purpose immediately clear
- recognizability: memorability / distinctiveness

Describe only what is actually visible. Do not guess at brand colors, fonts, or intent beyond what this single image shows.`;

const DOCUMENT_ANALYSIS_INSTRUCTIONS = `${BASE_SYSTEM_RULES}

Task: You are given one uploaded PDF document (e.g. brand guidelines, a one-pager, or marketing collateral). Extract its content and structure honestly:
- extractedText: the significant text content (headings and key copy) actually present in the document — never invent content that isn't there
- structureSummary: the document's structure (sections/headings, approximate length)
- brandConsistencyNotes: what the document itself shows about brand voice/visual consistency
- summary: a short overall summary

If the document is unreadable, is a low-quality scan with no extractable text, or is empty, say so plainly in every field rather than guessing at content.`;

/** Sends one uploaded image to the model as real vision input. */
export async function analyzeImageAsset(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}): Promise<ImageAssetAnalysis> {
  const dataUrl = `data:${params.mimeType};base64,${params.base64Data}`;
  const input: OpenAI.Responses.ResponseInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: `Analyze this uploaded brand asset image: "${params.fileName}".` },
        { type: "input_image", image_url: dataUrl, detail: "auto" },
      ],
    },
  ];

  return callStructuredStage({
    stage: "asset-image-analysis",
    schema: ImageAssetAnalysisSchema,
    schemaName: "image_asset_analysis",
    instructions: IMAGE_ANALYSIS_INSTRUCTIONS,
    input,
  });
}

/** Sends one uploaded PDF to the model as real file input for text/structure extraction. */
export async function analyzeDocumentAsset(params: { fileName: string; base64Data: string }): Promise<DocumentAssetAnalysis> {
  const input: OpenAI.Responses.ResponseInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: `Analyze this uploaded PDF document: "${params.fileName}".` },
        {
          type: "input_file",
          file_data: `data:application/pdf;base64,${params.base64Data}`,
          filename: params.fileName,
        },
      ],
    },
  ];

  return callStructuredStage({
    stage: "asset-document-analysis",
    schema: DocumentAssetAnalysisSchema,
    schemaName: "document_asset_analysis",
    instructions: DOCUMENT_ANALYSIS_INSTRUCTIONS,
    input,
  });
}
