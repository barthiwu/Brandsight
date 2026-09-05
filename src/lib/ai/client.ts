import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

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
  return process.env.OPENAI_MODEL || "gpt-5.5-mini";
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
  input: string;
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

      return revalidated.data;
    } catch (err) {
      lastError = err;
      console.error(`[ai:${params.stage}] attempt ${attempt}/${MAX_ATTEMPTS} failed`, err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new AiStageError(params.stage, `Stage "${params.stage}" failed after ${MAX_ATTEMPTS} attempts.`, lastError);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
