"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestAssetUploadAction } from "@/lib/actions/assets";
import { Alert } from "@/components/ui/Alert";
import { ALLOWED_ASSET_MIME_TYPES, MAX_ASSET_FILE_SIZE_BYTES } from "@/lib/validation/schemas";

// Matches STORAGE_BUCKET_NAME / the bucket created in
// supabase/migrations/0006_storage.sql. Not sensitive — bucket access is
// controlled by the signed upload token and storage RLS, not by secrecy
// of the name — so it's fine to inline here rather than add a second
// NEXT_PUBLIC_ env var for it.
const BUCKET = "brand-assets";

export function AssetUploadField({ auditId }: { auditId: string }) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_ASSET_MIME_TYPES.includes(file.type as (typeof ALLOWED_ASSET_MIME_TYPES)[number])) {
      setError("Only PNG, JPG, WEBP, or PDF files are supported.");
      setStatus("error");
      return;
    }
    if (file.size > MAX_ASSET_FILE_SIZE_BYTES) {
      setError("File must be 10MB or smaller.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    const result = await requestAssetUploadAction(auditId, file.name, file.type, file.size);
    if (!result.ok || !result.path || !result.token) {
      setError(result.error ?? "Upload failed.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from(BUCKET).uploadToSignedUrl(result.path, result.token, file);
    if (uploadError) {
      setError("Could not upload file.");
      setStatus("error");
      return;
    }

    setUploadedNames((prev) => [...prev, file.name]);
    setStatus("done");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-(--color-text)" htmlFor="asset-upload">
        Brand assets (optional)
      </label>
      <p className="text-xs text-(--color-text-secondary)">Logo, screenshots, or brand guidelines. PNG, JPG, WEBP, or PDF — up to 10MB.</p>
      <input
        ref={inputRef}
        id="asset-upload"
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="text-sm"
      />
      {status === "uploading" && <span className="text-xs text-(--color-text-secondary)">Uploading…</span>}
      {error && <Alert tone="error">{error}</Alert>}
      {uploadedNames.length > 0 && (
        <ul className="text-xs text-(--color-text-secondary)">
          {uploadedNames.map((name) => (
            <li key={name}>✓ {name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

