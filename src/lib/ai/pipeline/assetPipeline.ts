import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables, DimensionKey, EvidenceSourceType, EvidenceStatus, ConfidenceLevel } from "@/types/database";
import { analyzeImageAsset, analyzeDocumentAsset } from "./assetAnalysis";
import { formatImageAnalysisForEvidence, formatDocumentAnalysisForEvidence } from "./assetAnalysisSchemas";

const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME ?? "brand-assets";
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface AssetEvidenceRow {
  dimension: DimensionKey;
  source_type: EvidenceSourceType;
  source_reference: string | null;
  content: string | null;
  evidence_status: EvidenceStatus;
  confidence: ConfidenceLevel;
}

/**
 * Runs real OpenAI-vision/document analysis on every uploaded brand asset
 * for an audit (hardening pass Known Issue #1), persisting an honest
 * `analysis_status` on each asset and returning evidence rows for the
 * Visual dimension. A failure analyzing one asset (bad download, API
 * error, unsupported type) is recorded as `unavailable` evidence and never
 * blocks the other assets or the rest of the pipeline — asset analysis is
 * a best-effort enrichment, not a hard dependency of audit completion.
 */
export async function analyzeAuditAssets(assets: Tables<"audit_assets">[]): Promise<AssetEvidenceRow[]> {
  if (assets.length === 0) return [];

  const supabase = createAdminClient();
  const evidence: AssetEvidenceRow[] = [];

  for (const asset of assets) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(asset.storage_path);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "Storage download returned no data.");
      }
      const base64Data = Buffer.from(await blob.arrayBuffer()).toString("base64");

      if (IMAGE_MIME_TYPES.has(asset.mime_type)) {
        const analysis = await analyzeImageAsset({ fileName: asset.file_name, mimeType: asset.mime_type, base64Data });
        evidence.push({
          dimension: "visual",
          source_type: "uploaded_asset",
          source_reference: asset.file_name,
          evidence_status: "observed",
          confidence: "high",
          content: formatImageAnalysisForEvidence(asset.file_name, analysis),
        });
        await supabase.from("audit_assets").update({ analysis_status: "analyzed" }).eq("id", asset.id);
      } else if (asset.mime_type === "application/pdf") {
        const analysis = await analyzeDocumentAsset({ fileName: asset.file_name, base64Data });
        evidence.push({
          dimension: "visual",
          source_type: "uploaded_asset",
          source_reference: asset.file_name,
          evidence_status: "observed",
          confidence: "medium",
          content: formatDocumentAnalysisForEvidence(asset.file_name, analysis),
        });
        await supabase.from("audit_assets").update({ analysis_status: "analyzed" }).eq("id", asset.id);
      } else {
        // The DB check constraint on mime_type should make this
        // unreachable, but never silently drop an asset without recording
        // something honest about it.
        evidence.push({
          dimension: "visual",
          source_type: "uploaded_asset",
          source_reference: asset.file_name,
          evidence_status: "unavailable",
          confidence: "low",
          content: `"${asset.file_name}" has an unsupported file type (${asset.mime_type}) and was not analyzed.`,
        });
        await supabase.from("audit_assets").update({ analysis_status: "skipped" }).eq("id", asset.id);
      }
    } catch (err) {
      console.error(`[pipeline] asset analysis failed for asset ${asset.id}`, err);
      evidence.push({
        dimension: "visual",
        source_type: "uploaded_asset",
        source_reference: asset.file_name,
        evidence_status: "unavailable",
        confidence: "low",
        content: `"${asset.file_name}" could not be analyzed (${err instanceof Error ? err.message : "unknown error"}). Recorded honestly rather than guessed at.`,
      });
      await supabase.from("audit_assets").update({ analysis_status: "failed" }).eq("id", asset.id);
    }
  }

  return evidence;
}
