import type { ReactNode } from "react";

type Tone = "error" | "success" | "info" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  error: "bg-red-50 border-red-200 text-red-800",
  success: "bg-green-50 border-green-200 text-green-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-(--color-text)">{title}</h3>
      {description && <p className="max-w-sm text-sm text-(--color-text-secondary)">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-(--color-text-secondary)" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
