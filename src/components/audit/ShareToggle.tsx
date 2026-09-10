"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { enableSharingAction, disableSharingAction } from "@/lib/actions/sharing";

export function ShareToggle({
  auditId,
  initialToken,
  initialActive,
  appUrl,
}: {
  auditId: string;
  initialToken: string | null;
  initialActive: boolean;
  appUrl: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [isActive, setIsActive] = useState(initialActive);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shareUrl = token ? `${appUrl}/shared/audit/${token}` : null;

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = isActive ? await disableSharingAction(auditId) : await enableSharingAction(auditId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsActive(!!result.isActive);
      if (result.shareToken) setToken(result.shareToken);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-(--color-text)">Public sharing</p>
          <p className="text-xs text-(--color-text-secondary)">
            {isActive ? "Anyone with the link can view a read-only version of this report." : "Sharing is currently off."}
          </p>
        </div>
        <Button variant={isActive ? "secondary" : "primary"} onClick={toggle} isLoading={isPending}>
          {isActive ? "Disable sharing" : "Share audit"}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {isActive && shareUrl && (
        <div className="flex items-center gap-2">
          <input readOnly value={shareUrl} className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-xs" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
