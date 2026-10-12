import { describe, expect, it } from "vitest";
import { sniffAssetMimeType, matchesDeclaredMimeType } from "@/lib/validation/fileSignature";

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const SVG_AS_TEXT = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const HTML_AS_TEXT = new TextEncoder().encode("<html><body>hi</body></html>");

describe("sniffAssetMimeType", () => {
  it("recognizes a real PNG signature", () => {
    expect(sniffAssetMimeType(PNG_HEADER)).toBe("image/png");
  });

  it("recognizes a real JPEG signature", () => {
    expect(sniffAssetMimeType(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("recognizes a real WEBP signature (RIFF....WEBP)", () => {
    expect(sniffAssetMimeType(WEBP_HEADER)).toBe("image/webp");
  });

  it("recognizes a real PDF signature", () => {
    expect(sniffAssetMimeType(PDF_HEADER)).toBe("application/pdf");
  });

  it("returns null for content that matches none of the allowed signatures (e.g. SVG or HTML text)", () => {
    expect(sniffAssetMimeType(SVG_AS_TEXT)).toBeNull();
    expect(sniffAssetMimeType(HTML_AS_TEXT)).toBeNull();
  });

  it("returns null for an empty or too-short buffer rather than throwing", () => {
    expect(sniffAssetMimeType(new Uint8Array([]))).toBeNull();
    expect(sniffAssetMimeType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("matchesDeclaredMimeType", () => {
  it("matches real bytes against their correctly-declared type", () => {
    expect(matchesDeclaredMimeType(PNG_HEADER, "image/png")).toBe(true);
    expect(matchesDeclaredMimeType(PDF_HEADER, "application/pdf")).toBe(true);
  });

  it("rejects a spoofed declared type — the actual security scenario this exists for", () => {
    // An SVG (which this app does not allow at all) uploaded with a
    // spoofed Content-Type of image/png, exactly the bypass a client
    // controls when PUTting directly to the signed Storage URL.
    expect(matchesDeclaredMimeType(SVG_AS_TEXT, "image/png")).toBe(false);
    // A real JPEG declared as a PDF.
    expect(matchesDeclaredMimeType(JPEG_HEADER, "application/pdf")).toBe(false);
  });
});
