/**
 * Magic-byte sniffing for uploaded brand assets (security audit finding).
 *
 * Why this exists: requestAssetUploadAction never sees the file's actual
 * bytes — it only issues a signed Supabase Storage upload URL, and the
 * browser PUTs the bytes directly to Storage with whatever Content-Type
 * it (or an attacker scripting the upload) declares. The DB's mime_type
 * column is populated from that client-supplied value and only checked
 * against an enum of allowed strings — never against the actual file
 * content. assetPipeline.ts then branches purely on that stored
 * mime_type to decide whether to send the downloaded blob to OpenAI as
 * an image (`image_url: data:image/png;base64,...`) or a PDF
 * (`input_file`). A file whose real bytes don't match its declared type
 * — an SVG, HTML, or arbitrary binary uploaded with a spoofed
 * `Content-Type: image/png` — would be accepted, stored, and forwarded
 * to OpenAI mislabeled as something it isn't.
 *
 * This checks the small set of magic-byte signatures for exactly the
 * four MIME types this app's upload schema allows (see
 * validation/schemas.ts's assetUploadMetaSchema) — narrow and
 * deliberately not a general file-type-detection library, since that's
 * all that's needed here.
 */
export type AllowedAssetMimeType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

const SIGNATURES: { mimeType: AllowedAssetMimeType; matches: (bytes: Uint8Array) => boolean }[] = [
  {
    mimeType: "image/png",
    matches: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mimeType: "image/jpeg",
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: "image/webp",
    // RIFF <4-byte size> WEBP
    matches: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mimeType: "application/pdf",
    // "%PDF-"
    matches: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
];

/**
 * Returns the MIME type the file's actual bytes indicate, or null if it
 * doesn't match any of the allowed signatures at all (e.g. an SVG, HTML
 * document, or arbitrary binary).
 */
export function sniffAssetMimeType(bytes: Uint8Array): AllowedAssetMimeType | null {
  return SIGNATURES.find((s) => s.matches(bytes))?.mimeType ?? null;
}

/**
 * True when the file's real content matches its declared mime_type.
 * image/jpeg and image/png/webp are never confused with each other or
 * with a PDF by this check, so any mismatch here is a genuine
 * declared-vs-actual discrepancy, not a near-miss.
 */
export function matchesDeclaredMimeType(bytes: Uint8Array, declaredMimeType: string): boolean {
  return sniffAssetMimeType(bytes) === declaredMimeType;
}
