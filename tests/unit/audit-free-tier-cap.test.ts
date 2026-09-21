import { describe, it, expect, vi, beforeEach } from "vitest";

// Devil's-advocate follow-up: there was previously no limit at all on how
// many audits one account could submit for real AI processing, and every
// audit costs real OpenAI spend — a Deep Audit especially (vision calls,
// competitor fetch, website fetch, on top of the same 9 stages a Quick
// Audit runs). With signup free and no bot protection, that's an open
// door for unlimited free usage. These tests exercise the new
// per-account, per-audit-type cap in submitAuditForProcessingAction
// directly, mocking just enough of the Supabase client to reach the
// check without needing a real database.

// src/lib/actions/audits.ts imports checkRateLimit from
// @/lib/security/rateLimit, which does its own top-level `import
// "server-only"` — that throws unconditionally outside Next's bundler,
// so it has to be stubbed for this file to be importable under plain
// vitest at all (same reason as tests/unit/lead-capture-action.test.ts).
vi.mock("server-only", () => ({}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect: (p: string) => mockRedirect(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const USER = { id: "user-1" };
const AUDIT = {
  id: "audit-1",
  owner_id: USER.id,
  audit_type: "quick" as const,
  status: "draft" as const,
  brand_id: "brand-1",
};

function makeSupabase(opts: { freeAuditCount: number }) {
  const countQueryArgs: { auditType?: unknown; ownerId?: unknown; statuses?: unknown } = {};

  const auditsTable = {
    // Distinguishes the initial by-id lookup from the free-tier count
    // query by whether `{ count: "exact", head: true }` was passed —
    // matches the two real shapes submitAuditForProcessingAction uses.
    select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
      if (selectOpts?.count) {
        const chain = {
          eq: (col: string, val: unknown) => {
            if (col === "owner_id") countQueryArgs.ownerId = val;
            if (col === "audit_type") countQueryArgs.auditType = val;
            return chain;
          },
          in: async (col: string, vals: unknown) => {
            if (col === "status") countQueryArgs.statuses = vals;
            return { count: opts.freeAuditCount, error: null };
          },
        };
        return chain;
      }
      const chain = {
        eq: () => chain,
        maybeSingle: async () => ({ data: AUDIT, error: null }),
      };
      return chain;
    },
    update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
  };

  const responsesTable = { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  const brandsTable = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "brand-1", name: "Test Co" }, error: null }) }) }) };

  return {
    client: {
      auth: { getUser: async () => ({ data: { user: USER } }) },
      from: (table: string) => {
        if (table === "audits") return auditsTable;
        if (table === "audit_responses") return responsesTable;
        if (table === "brands") return brandsTable;
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
    getCountQueryArgs: () => countQueryArgs,
  };
}

describe("submitAuditForProcessingAction — free-tier audit cap", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedirect.mockClear();
  });

  it("blocks submission once the account has reached MAX_FREE_QUICK_AUDITS_PER_ACCOUNT", async () => {
    process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT = "3";
    const { client } = makeSupabase({ freeAuditCount: 3 });
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));

    const { submitAuditForProcessingAction } = await import("@/lib/actions/audits");
    const result = await submitAuditForProcessingAction("audit-1");

    expect(result.error).toMatch(/free quick audit/i);
    delete process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT;
  });

  it("counts only ever-submitted audits (ready/processing/completed/failed), scoped to this account and audit type", async () => {
    process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT = "3";
    const { client, getCountQueryArgs } = makeSupabase({ freeAuditCount: 3 });
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));

    const { submitAuditForProcessingAction } = await import("@/lib/actions/audits");
    await submitAuditForProcessingAction("audit-1");

    const args = getCountQueryArgs();
    expect(args.ownerId).toBe(USER.id);
    expect(args.auditType).toBe("quick");
    expect(args.statuses).toEqual(["ready", "processing", "completed", "failed"]);
    delete process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT;
  });

  it("does not block (proceeds past the cap check) when under the cap", async () => {
    process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT = "5";
    const { client } = makeSupabase({ freeAuditCount: 2 });
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));

    const { submitAuditForProcessingAction } = await import("@/lib/actions/audits");
    const result = await submitAuditForProcessingAction("audit-1");

    // Validation will likely still fail for this bare-bones fixture (no
    // real answers), but it must NOT be the free-tier-cap error — that's
    // the one thing this test is checking.
    expect(result.error).not.toMatch(/free quick audit/i);
    delete process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT;
  });

  it("a cap of 0 disables the check entirely — no count query is even issued", async () => {
    process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT = "0";
    const { client } = makeSupabase({ freeAuditCount: 999 });
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));

    const { submitAuditForProcessingAction } = await import("@/lib/actions/audits");
    const result = await submitAuditForProcessingAction("audit-1");

    expect(result.error).not.toMatch(/free quick audit/i);
    delete process.env.MAX_FREE_QUICK_AUDITS_PER_ACCOUNT;
  });
});
