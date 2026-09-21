import type { UsageTotals } from "./usageTracking";

/**
 * Converts real token usage into an estimated dollar cost, using
 * OPENAI_INPUT_PRICE_PER_1M / OPENAI_OUTPUT_PRICE_PER_1M env vars —
 * never a hardcoded price. Per-model pricing changes over time and
 * BrandSight's own model is itself env-configurable (OPENAI_MODEL), so a
 * number baked into this codebase could silently go stale; the
 * authoritative source is always OpenAI's own current pricing (or the
 * account's actual negotiated rate) as read from
 * platform.openai.com/docs/pricing or the account's billing dashboard.
 *
 * Returns null — "cost not shown," not "cost is $0" — whenever either
 * price env var is unset or invalid, so the UI can distinguish "we
 * genuinely don't know the price" from "this really cost nothing."
 * Token counts (see usageTracking.ts) are recorded unconditionally
 * either way — that part needs no pricing input at all.
 */
export function estimateCostUsd(usage: Pick<UsageTotals, "inputTokens" | "outputTokens">): number | null {
  const inputPricePer1M = Number(process.env.OPENAI_INPUT_PRICE_PER_1M);
  const outputPricePer1M = Number(process.env.OPENAI_OUTPUT_PRICE_PER_1M);
  if (!Number.isFinite(inputPricePer1M) || !Number.isFinite(outputPricePer1M)) return null;

  const cost = (usage.inputTokens / 1_000_000) * inputPricePer1M + (usage.outputTokens / 1_000_000) * outputPricePer1M;
  return Math.round(cost * 10_000) / 10_000; // matches the ai_estimated_cost_usd numeric(10,4) column
}
