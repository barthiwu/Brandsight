"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

export function DeleteBrandButton({
  brandId,
  brandName,
  deleteAction,
}: {
  brandId: string;
  brandName: string;
  deleteAction: (brandId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmed = window.confirm(
      `Delete "${brandName}" and every audit run against it? Uploaded files are removed too. This cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteAction(brandId);
      } catch {
        // deleteBrandAction redirects on success, which Next.js implements
        // by throwing internally — that's expected and never reaches here.
        // A real failure (network, unexpected server error) does.
        setError("Could not delete this brand. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && (
        <p role="alert" className="text-xs font-medium text-(--color-danger)">
          {error}
        </p>
      )}
      <Button type="button" variant="danger" isLoading={isPending} onClick={handleClick}>
        Delete brand
      </Button>
    </div>
  );
}
