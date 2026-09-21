import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Real per-audit AI token usage, previously tracked nowhere — the only
 * way to know what any given audit actually cost was to read the monthly
 * OpenAI invoice and guess. `callStructuredStage` (client.ts) is the one
 * chokepoint every AI call in the pipeline goes through (text stages and
 * per-asset vision analysis alike), so it's also the one place usage
 * needs to be recorded from.
 *
 * Threaded via AsyncLocalStorage rather than passed as an explicit
 * parameter through every stage function's signature (stage1-normalize.ts
 * through stage8-actionplan.ts, assetPipeline.ts, competitorPipeline.ts) —
 * that would mean touching every call site along a deep, already-stable
 * call chain just to plumb one cross-cutting concern through it. This is
 * the standard Node pattern for exactly that: request-scoped context that
 * follows the async call tree implicitly.
 */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const storage = new AsyncLocalStorage<UsageTotals>();

/** Runs `fn` with a fresh usage accumulator active for its entire async call tree. */
export async function withUsageTracking<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageTotals }> {
  const totals: UsageTotals = { inputTokens: 0, outputTokens: 0, calls: 0 };
  return storage.run(totals, async () => ({ result: await fn(), usage: totals }));
}

/**
 * Adds one call's usage to the active accumulator, if any. A no-op
 * outside a withUsageTracking() call (e.g. a unit test invoking
 * callStructuredStage directly) — usage tracking is additive
 * observability, never a condition anything else depends on.
 */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  const totals = storage.getStore();
  if (!totals) return;
  totals.inputTokens += inputTokens;
  totals.outputTokens += outputTokens;
  totals.calls += 1;
}
