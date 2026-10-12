import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route.ts transitively imports several modules that do `import
// "server-only"` for real (supabase/admin.ts, security/rateLimit.ts) —
// throws unconditionally outside Next's own bundler, same reasoning as
// every other test file in this suite that stubs these. acquireProcessingSlot
// itself doesn't call any of these directly, so a minimal stub is enough
// to let the module load.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/ai/pipeline/runPipeline", () => ({ runAuditPipeline: async () => {} }));
vi.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 1 }),
  RATE_LIMITS: { auditProcess: { limit: 5, windowSeconds: 3600 } },
}));
vi.mock("@/lib/notifications/adminAlert", () => ({
  notifyAdminOfCapacityOverrun: async () => {},
  notifyAdminOfPipelineFailure: async () => {},
}));

const { acquireProcessingSlot } = await import("@/app/api/audits/[auditId]/process/route");

// Regression coverage for a real bug found during a security/bug audit:
// acquireProcessingSlot's two RPC calls (the normal-capacity attempt and
// the force-admit attempt after waiting out the full capacity window)
// only ever checked `data`, never `error`. A transient Supabase/network
// error on either call comes back as `data: null, error: {...}` — which
// fell through as if the lock simply wasn't acquired, and in the
// force-admit case specifically, as `acquired: false,
// admittedOverCapacity: true`. The route's own `if (!acquired)` branch
// returned early before ever checking `admittedOverCapacity`, so neither
// the pipeline nor the admin alert ever ran — the audit's row never left
// "ready"/"failed" and nothing was ever going to retry it, while the
// client had just been told "processing". These tests exercise
// acquireProcessingSlot directly against a hand-built Supabase mock, so
// they don't need a real database.

const FORCE_ADMIT_MAX_CONCURRENT = 2147483647;

function buildAdminMock(opts: {
  // Response for every regular-capacity attempt (p_max_concurrent set to
  // the configured cap, not the force-admit sentinel).
  normalResult: { data: boolean | null; error: { message: string } | null };
  // Response for the one final force-admit attempt
  // (p_max_concurrent === FORCE_ADMIT_MAX_CONCURRENT). Only ever reached
  // if every normal attempt reported "at capacity" (data: false, no
  // error) until the wait window ran out.
  forceResult?: { data: boolean | null; error: { message: string } | null };
  auditStatus?: string;
}) {
  const rpc = vi.fn(async (_fn: string, args: { p_max_concurrent: number }) => {
    if (args.p_max_concurrent === FORCE_ADMIT_MAX_CONCURRENT) {
      return opts.forceResult ?? { data: true, error: null };
    }
    return opts.normalResult;
  });

  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { status: opts.auditStatus ?? "ready" }, error: null }),
      }),
    }),
  }));

  return { rpc, from } as unknown as Parameters<typeof acquireProcessingSlot>[0];
}

describe("acquireProcessingSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acquires normally when the lock RPC succeeds on the first try", async () => {
    const admin = buildAdminMock({ normalResult: { data: true, error: null } });

    const result = await acquireProcessingSlot(admin, "audit-1");

    expect(result).toEqual({ acquired: true, admittedOverCapacity: false });
  });

  it("surfaces a real RPC error as lockError, instead of silently treating it as 'not acquired'", async () => {
    const admin = buildAdminMock({
      normalResult: { data: null, error: { message: "connection reset" } },
    });

    const result = await acquireProcessingSlot(admin, "audit-1");

    expect(result.acquired).toBe(false);
    expect(result.admittedOverCapacity).toBe(false);
    expect(result.lockError).toBe("connection reset");
  });

  it("returns a benign 'already claimed' result (no lockError) when another request owns this audit", async () => {
    const admin = buildAdminMock({
      normalResult: { data: false, error: null },
      auditStatus: "processing",
    });

    const result = await acquireProcessingSlot(admin, "audit-1");

    expect(result).toEqual({ acquired: false, admittedOverCapacity: false });
  });

  it("surfaces a force-admit RPC error as lockError with admittedOverCapacity true, rather than returning a misleading 'processing' outcome with nothing actually started", async () => {
    // Every regular-capacity attempt reports "at capacity, still ready" so
    // the loop runs out its wait window, then the final (force-admit)
    // call errors.
    const admin = buildAdminMock({
      normalResult: { data: false, error: null },
      forceResult: { data: null, error: { message: "timeout reaching database" } },
      auditStatus: "ready",
    });

    const promise = acquireProcessingSlot(admin, "audit-1");
    // Fast-forward past the full capacity-wait window (60s of 4s polls)
    // without the test actually waiting in real time.
    await vi.advanceTimersByTimeAsync(65_000);

    const result = await promise;
    expect(result.acquired).toBe(false);
    expect(result.admittedOverCapacity).toBe(true);
    expect(result.lockError).toBe("timeout reaching database");
  });
});
