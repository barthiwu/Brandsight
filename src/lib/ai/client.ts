import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { recordUsage } from "./usageTracking";

// No temperature was set at all before this — every stage ran on the
// model's default sampling (~1.0), so the same business, audited twice
// with nothing actually changed, could plausibly come back with a
// different BrandSight Score both times. That's a real trust problem for
// a product whose whole pitch is "here's your objective score." Low but
// not zero: 0 occasionally causes degenerate/repetitive output on longer
// free-form text (the executive summary, recommendation prose), while a
// low-but-nonzero value meaningfully cuts run-to-run variance without
// that risk. Applies to every stage uniformly, since scoring
// consistency matters for all of them, not just the numeric ones.
const STRUCTURED_OUTPUT_TEMPERATURE = 0.2;

let cachedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export function getConfiguredModel(): string {
  // Spec §6: model must be configurable via env, never hard-coded through
  // the app. The exact best model changes over time — check
  // platform.openai.com/docs/models when deploying — so only the
  // fallback default lives here.
  //
  // gpt-5.6-luna confirmed live (Sept 2026) against OpenAI's own model
  // catalog and pricing pages as the current cost-efficient/mini tier
  // model. The previous fallback, gpt-5.5-mini, no longer exists in the
  // catalog and every live call to it 404s with "model_not_found" — found
  // live during E2E testing (see HARDENING_REPORT.md).
  return process.env.OPENAI_MODEL || "gpt-5.6-luna";
}

export class AiStageError extends Error {
  constructor(
    public stage: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "AiStageError";
  }
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

/**
 * Calls the OpenAI Responses API for one structured-output pipeline stage
 * and validates the result against the given Zod schema before returning
 * it (spec §50: "Every AI response must be validated before being stored").
 * Retries a limited number of times with exponential backoff on API
 * errors OR on a response that fails schema validation (spec §59); throws
 * AiStageError — never returns/stores malformed data — once attempts are
 * exhausted.
 */
export async function callStructuredStage<T>(params: {
  stage: string;
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  /**
   * Plain text for the text-only pipeline stages, or a full Responses API
   * input array for stages that attach an image or file (asset vision
   * analysis — see pipeline/assetAnalysis.ts).
   */
  input: string | OpenAI.Responses.ResponseInput;
}): Promise<T> {
  const client = getOpenAIClient();
  const model = getConfiguredModel();

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.responses.parse({
        model,
        instructions: params.instructions,
        input: params.input,
        text: { format: zodTextFormat(params.schema, params.schemaName) },
        temperature: STRUCTURED_OUTPUT_TEMPERATURE,
      });

      if (response.output_parsed === null) {
        throw new Error("Model returned no parseable output.");
      }

      // Defense in depth: re-validate even though the SDK already parsed
      // against the schema, in case of a future SDK behavior change.
      const revalidated = params.schema.safeParse(response.output_parsed);
      if (!revalidated.success) {
        throw new Error(`Schema re-validation failed: ${revalidated.error.message}`);
      }

      // Real per-call token usage, previously recorded nowhere. See
      // usageTracking.ts — a no-op when this call isn't inside a
      // withUsageTracking() run (e.g. a unit test calling this directly).
      if (response.usage) {
        recordUsage(response.usage.input_tokens, response.usage.output_tokens);
      }

      return revalidated.data;
    } catch (err) {
      lastError = err;
      console.error(`[ai:${params.stage}] attempt ${attempt}/${MAX_ATTEMPTS} failed`, err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  // Include the last underlying error's own message, not just the generic
  // "failed after N attempts" — this string is what ends up stored verbatim
  // in audits.processing_error (see runPipeline.ts's catch handler), and a
  // generic message with no real detail meant a live pipeline failure could
  // only be diagnosed by digging through server console logs after the
  // fact. Found live: a normalize-stage failure surfaced only
  // 'Stage "normalize" failed after 3 attempts.' in the database, with the
  // actual cause visible only in stdout the investigating session didn't
  // have access to.
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new AiStageError(
    params.stage,
    `Stage "${params.stage}" failed after ${MAX_ATTEMPTS} attempts: ${lastErrorMessage}`,
    lastError
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
