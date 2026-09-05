"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/lib/actions/audits";

export function DeleteAuditButton({
  auditId,
  deleteAction,
}: {
  auditId: string;
  deleteAction: (auditId: string) => Promise<ActionState>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmed = window.confirm("Delete this audit and everything in it (findings, evidence, uploaded files)? This cannot be undone.");
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteAction(auditId);
      // deleteAuditAction redirects on success (thrown internally by
      // Next.js), so reaching here at all means it returned an error.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && (
        <p role="alert" className="text-xs font-medium text-(--color-danger)">
          {error}
        </p>
      )}
      <Button type="button" variant="danger" size="sm" isLoading={isPending} onClick={handleClick}>
        Delete audit
      </Button>
    </div>
  );
}
