import type { ConfidenceLevel } from "@/types/database";

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

// Icons/symbols accompany color so status is never color-only (spec §83).
const CONFIDENCE_SYMBOL: Record<ConfidenceLevel, string> = {
  high: "●●●",
  medium: "●●○",
  low: "●○○",
};

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CONFIDENCE_STYLES[confidence]}`}
      aria-label={`Confidence: ${confidence}`}
    >
      <span aria-hidden="true" className="tracking-tighter">
        {CONFIDENCE_SYMBOL[confidence]}
      </span>
      {confidence[0].toUpperCase() + confidence.slice(1)} confidence
    </span>
  );
}

const BAND_STYLES: Record<string, string> = {
  Exceptional: "bg-green-50 text-green-800 border-green-200",
  Strong: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Good Foundation": "bg-blue-50 text-blue-800 border-blue-200",
  "Needs Improvement": "bg-amber-50 text-amber-800 border-amber-200",
  Weak: "bg-orange-50 text-orange-800 border-orange-200",
  Critical: "bg-red-50 text-red-800 border-red-200",
};

export function ScoreBandBadge({ band }: { band: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${BAND_STYLES[band] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
    >
      {band}
    </span>
  );
}

const TYPE_STYLES: Record<string, string> = {
  strength: "bg-green-50 text-green-800 border-green-200",
  weakness: "bg-red-50 text-red-800 border-red-200",
  opportunity: "bg-blue-50 text-blue-800 border-blue-200",
};

export function FindingTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${TYPE_STYLES[type] ?? ""}`}
    >
      {type}
    </span>
  );
}
