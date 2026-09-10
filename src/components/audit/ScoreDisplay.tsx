import { ScoreBandBadge } from "@/components/ui/Badge";
import type { ConfidenceLevel } from "@/types/database";
import { ConfidenceBadge } from "@/components/ui/Badge";

export function ScoreDisplay({
  score,
  band,
  confidence,
}: {
  score: number | null;
  band: string | null;
  confidence?: ConfidenceLevel;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-(--color-text-secondary)">BrandSight Score</p>
      <p className="text-6xl font-bold text-(--color-navy)">
        {score != null ? score : "—"}
        <span className="text-2xl font-medium text-(--color-text-secondary)">/100</span>
      </p>
      <div className="flex items-center gap-2">
        {band && <ScoreBandBadge band={band} />}
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </div>
      {score == null && (
        <p className="max-w-sm text-xs text-(--color-text-secondary)">
          Not enough evidence was available to calculate a full overall score for this audit.
        </p>
      )}
    </div>
  );
}
