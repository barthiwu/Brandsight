import { describe, it, expect, vi, beforeEach } from "vitest";

// Two things under test, both from the "devil's advocate" follow-up pass:
//
//  1. usageTracking.ts's AsyncLocalStorage-based accumulator: usage
//     recorded outside any withUsageTracking() run is a safe no-op (so
//     callStructuredStage never has to know or care whether it's being
//     called from a tracked pipeline run or a bare unit test), and usage
//     recorded from two *concurrent* withUsageTracking() runs never
//     leaks between them — the actual property AsyncLocalStorage exists
//     to guarantee, worth asserting directly rather than trusting by
//     construction.
//  2. callStructuredStage (client.ts) now passes a low, fixed temperature
//     to every call (previously unset, i.e. the model's default ~1.0 —
//     see client.ts's comment on why that mattered for score
//     consistency) and records real per-call token usage from the
//     response, instead of tracking nothing at all.

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

describe("usageTracking — accumulator isolation", () => {
  it("recordUsage outside any withUsageTracking() run is a safe no-op", async () => {
    const { recordUsage } = await import("@/lib/ai/usageTracking");
    expect(() => recordUsage(100, 50)).not.toThrow();
  });

  it("accumulates multiple recordUsage calls within one run", async () => {
    const { withUsageTracking, recordUsage } = await import("@/lib/ai/usageTracking");

    const { usage } = await withUsageTracking(async () => {
      recordUsage(100, 20);
      recordUsage(50, 10);
      return "done";
    });

    expect(usage).toEqual({ inputTokens: 150, outputTokens: 30, calls: 2 });
  });

  it("never leaks usage between two concurrent withUsageTracking() runs", async () => {
    const { withUsageTracking, recordUsage } = await import("@/lib/ai/usageTracking");

    const [a, b] = await Promise.all([
      withUsageTracking(async () => {
        recordUsage(1000, 1000);
        await new Promise((r) => setTimeout(r, 10));
        recordUsage(1000, 1000);
      }),
      withUsageTracking(async () => {
        recordUsage(1, 1);
        await new Promise((r) => setTimeout(r, 5));
        recordUsage(1, 1);
      }),
    ]);

    expect(a.usage).toEqual({ inputTokens: 2000, outputTokens: 2000, calls: 2 });
    expect(b.usage).toEqual({ inputTokens: 2, outputTokens: 2, calls: 2 });
  });
});

describe("callStructuredStage — temperature and usage recording", () => {
  beforeEach(() => {
    mockParse.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("passes a low, fixed temperature on every call", async () => {
    const { callStructuredStage } = await import("@/lib/ai/client");
    const { z } = await import("zod");

    mockParse.mockResolvedValue({ output_parsed: { ok: true }, usage: null });

    await callStructuredStage({
      stage: "normalize",
      schema: z.object({ ok: z.boolean() }),
      schemaName: "Test",
      instructions: "test",
      input: "test",
    });

    expect(mockParse).toHaveBeenCalledWith(expect.objectContaining({ temperature: expect.any(Number) }));
    const [[callArgs]] = mockParse.mock.calls;
    expect(callArgs.temperature).toBeGreaterThanOrEqual(0);
    expect(callArgs.temperature).toBeLessThan(1);
  });

  it("records real usage from the response when inside a tracked pipeline run", async () => {
    const { callStructuredStage } = await import("@/lib/ai/client");
    const { withUsageTracking } = await import("@/lib/ai/usageTracking");
    const { z } = await import("zod");

    mockParse.mockResolvedValue({
      output_parsed: { ok: true },
      usage: { input_tokens: 1234, output_tokens: 567, total_tokens: 1801 },
    });

    const { usage } = await withUsageTracking(() =>
      callStructuredStage({
        stage: "normalize",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Test",
        instructions: "test",
        input: "test",
      })
    );

    expect(usage).toEqual({ inputTokens: 1234, outputTokens: 567, calls: 1 });
  });

  it("doesn't throw when the response has no usage field (e.g. a mocked test double)", async () => {
    const { callStructuredStage } = await import("@/lib/ai/client");
    const { z } = await import("zod");

    mockParse.mockResolvedValue({ output_parsed: { ok: true }, usage: null });

    await expect(
      callStructuredStage({
        stage: "normalize",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Test",
        instructions: "test",
        input: "test",
      })
    ).resolves.toEqual({ ok: true });
  });
});
