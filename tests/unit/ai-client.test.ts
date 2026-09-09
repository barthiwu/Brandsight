import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for a real diagnostics gap found during live E2E
// testing: when a pipeline stage's OpenAI call fails on every retry,
// AiStageError's message used to be a generic "Stage \"X\" failed after 3
// attempts." with no detail about *why* — and that exact string is what
// ends up persisted verbatim in audits.processing_error (see
// runPipeline.ts's catch handler), since the app never stores the
// underlying error object, only AiStageError's own .message. A live
// failure was diagnosable only by digging through server stdout logs the
// investigating session didn't have access to. callStructuredStage now
// folds the last underlying error's own message into AiStageError's
// message, so the real cause is visible straight from the database.

vi.mock("server-only", () => ({}));

const mockParse = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    responses = { parse: mockParse };
  }
  return { default: MockOpenAI };
});

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: () => ({}),
}));

describe("callStructuredStage error messages", () => {
  beforeEach(() => {
    mockParse.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("includes the last underlying error's message, not just a generic 'failed after N attempts'", async () => {
    const { callStructuredStage, AiStageError } = await import("@/lib/ai/client");
    const { z } = await import("zod");

    mockParse.mockRejectedValue(new Error("429 Rate limit exceeded for gpt-5.6-luna"));

    await expect(
      callStructuredStage({
        stage: "normalize",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Test",
        instructions: "test",
        input: "test",
      })
    ).rejects.toMatchObject({
      constructor: AiStageError,
      message: 'Stage "normalize" failed after 3 attempts: 429 Rate limit exceeded for gpt-5.6-luna',
    });
  });

  it("stringifies a non-Error rejection instead of losing it", async () => {
    const { callStructuredStage } = await import("@/lib/ai/client");
    const { z } = await import("zod");

    mockParse.mockRejectedValue("weird non-error rejection");

    await expect(
      callStructuredStage({
        stage: "findings",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Test",
        instructions: "test",
        input: "test",
      })
    ).rejects.toMatchObject({
      message: 'Stage "findings" failed after 3 attempts: weird non-error rejection',
    });
  });
});
