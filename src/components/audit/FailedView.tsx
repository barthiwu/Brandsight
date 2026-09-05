"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { retryAuditAction, cancelAuditAction } from "@/lib/actions/audits";

export function FailedView({ auditId, errorMessage }: { auditId: string; errorMessage: string | null }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-border) bg-white p-8">
      <Alert tone="error">
        We couldn&apos;t finish this audit. {errorMessage ? "" : "Please try again."}
      </Alert>
      <p className="text-sm text-(--color-text-secondary)">
        Nothing you entered was lost — your answers, brand details, and any uploads are saved. You can retry the
        analysis now.
      </p>
      <div className="flex gap-3">
        <Button isLoading={isPending} onClick={() => startTransition(() => retryAuditAction(auditId))}>
          Retry audit
        </Button>
        <Button variant="secondary" onClick={() => startTransition(() => cancelAuditAction(auditId))}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
