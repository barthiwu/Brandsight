import { describe, expect, it, vi, beforeEach } from "vitest";

// assetPipeline.ts does `import "server-only"` and imports
// supabase/admin.ts (also "server-only" + reads
// SUPABASE_SERVICE_ROLE_KEY) — stub both so this can be exercised under
// plain vitest, same pattern used throughout this suite.
vi.mock("server-only", () => ({}));

const mockDownload = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: async () => ({ error: null }) }));
const mockAnalyzeImageAsset = vi.fn();
const mockAnalyzeDocumentAsset = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ download: mockDownload }) },
    from: () => ({ update: mockUpdate }),
  }),
}));

vi.mock("@/lib/ai/pipeline/assetAnalysis", () => ({
  analyzeImageAsset: (...args: unknown[]) => mockAnalyzeImageAsset(...args),
  analyzeDocumentAsset: (...args: unknown[]) => mockAnalyzeDocumentAsset(...args),
}));

const { analyzeAuditAssets } = await import("@/lib/ai/pipeline/assetPipeline");

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_BYTES = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

function blobFor(bytes: Uint8Array) {
  return { arrayBuffer: async () => bytes.buffer };
}

function makeAsset(overrides: Partial<{ id: string; file_name: string; mime_type: string; storage_path: string }>) {
  return {
    id: "asset-1",
    file_name: "logo.png",
    mime_type: "image/png",
    storage_path: "u/a/logo.png",
    ...overrides,
  } as Parameters<typeof analyzeAuditAssets>[0][number];
}

describe("analyzeAuditAssets — declared-vs-actual MIME type check", () => {
  beforeEach(() => {
    mockDownload.mockReset();
    mockUpdate.mockClear();
    mockAnalyzeImageAsset.mockReset();
    mockAnalyzeDocumentAsset.mockReset();
    mockAnalyzeImageAsset.mockResolvedValue({
      visualHierarchy: { score: 80, rationale: "x" },
      typography: { score: 80, rationale: "x" },
      color: { score: 80, rationale: "x" },
      composition: { score: 80, rationale: "x" },
      ctaVisibility: { score: null, rationale: "n/a" },
      brandConsistency: { score: 80, rationale: "x" },
      professionalism: { score: 80, rationale: "x" },
      clarity: { score: 80, rationale: "x" },
      recognizability: { score: 80, rationale: "x" },
      summary: "A logo.",
    });
  });

  it("analyzes a file whose real bytes match its declared image/png type", async () => {
    mockDownload.mockResolvedValue({ data: blobFor(PNG_BYTES), error: null });

    const result = await analyzeAuditAssets([makeAsset({})]);

    expect(mockAnalyzeImageAsset).toHaveBeenCalledTimes(1);
    expect(result[0].evidence_status).toBe("observed");
    expect(result[0].asset_id).toBe("asset-1");
    expect(mockUpdate).toHaveBeenCalledWith({ analysis_status: "analyzed" });
  });

  // Security regression test: a file declared as image/png whose real
  // bytes are something else entirely (here, an SVG — a type this app
  // never allows at all) must never reach OpenAI mislabeled as an image.
  it("refuses to analyze a file whose real content doesn't match its declared mime_type, and never calls the vision API", async () => {
    mockDownload.mockResolvedValue({ data: blobFor(SVG_BYTES), error: null });

    const result = await analyzeAuditAssets([makeAsset({ file_name: "fake-logo.png" })]);

    expect(mockAnalyzeImageAsset).not.toHaveBeenCalled();
    expect(mockAnalyzeDocumentAsset).not.toHaveBeenCalled();
    expect(result[0].evidence_status).toBe("unavailable");
    expect(result[0].content).toMatch(/doesn't match that file type/i);
    expect(mockUpdate).toHaveBeenCalledWith({ analysis_status: "failed" });
  });

  it("keys each evidence row by the asset's own id, so two same-named assets never collide", async () => {
    mockDownload.mockResolvedValue({ data: blobFor(PNG_BYTES), error: null });

    const result = await analyzeAuditAssets([
      makeAsset({ id: "asset-a", file_name: "logo.png" }),
      makeAsset({ id: "asset-b", file_name: "logo.png" }),
    ]);

    expect(result.map((r) => r.asset_id)).toEqual(["asset-a", "asset-b"]);
  });
});
