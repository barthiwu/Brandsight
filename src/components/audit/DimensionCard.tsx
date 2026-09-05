import Link from "next/link";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { getScoreBand } from "@/lib/scoring/dimensions";
import type { ConfidenceLevel, DimensionKey } from "@/types/database";

export function DimensionCard({
  auditId,
  dimensionKey,
  label,
  score,
  confidence,
}: {
  auditId: string;
  dimensionKey: DimensionKey;
  label: string;
  score: number | null;
  confidence: ConfidenceLevel;
}) {
  return (
    <Link
      href={`/audits/${auditId}/${dimensionKey}`}
      className="flex flex-col gap-2 rounded-xl border border-(--color-border) bg-white p-5 transition-shadow hover:shadow-md"
    >
      <p className="text-sm font-medium text-(--color-text-secondary)">{label}</p>
      <p className="text-3xl font-semibold text-(--color-text)">{score != null ? score : "—"}</p>
      {score != null ? (
        <p className="text-xs text-(--color-text-secondary)">{getScoreBand(score)}</p>
      ) : (
        <p className="text-xs text-(--color-text-secondary)">Not enough evidence</p>
      )}
      <ConfidenceBadge confidence={confidence} />
    </Link>
  );
}
