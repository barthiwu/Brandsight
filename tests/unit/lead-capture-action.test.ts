import { describe, expect, it, vi, beforeEach } from "vitest";

// `src/lib/actions/leads.ts` (and, transitively, `src/lib/security/rateLimit.ts`)
// import `createAdminClient` from `@/lib/supabase/admin`, which does
// `import "server-only"` — that package unconditionally throws unless
// resolved under Next's `react-server` export condition, so it can't be
// imported for real inside plain vitest. Mocking the module here means the
// real server-only file is never evaluated, while the actual control-flow
// logic in leads.ts (the part this test cares about) runs for real.
// `src/lib/security/rateLimit.ts` (imported transitively via leads.ts) also
// does its own top-level `import "server-only"`, which throws unconditionally
// outside Next's bundler regardless of which module triggered the import —
// so the package itself has to be replaced with a no-op, not just the admin
// client module.
vi.mock("server-only", () => ({}));

const mockCreateAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

const { submitLeadAction } = await import("@/lib/actions/leads");

/** A minimal chainable stand-in for the subset of the Supabase query
 * builder that leads.ts actually calls: .from(table).select(...).eq(...).maybeSingle() */
function selectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function makeFakeAdminClient(opts: {
  share?: { audit_id: string; is_active: boolean; expires_at: string | null } | null;
  audit?: { id: string; owner_id: string; status: string } | null;
  insertError?: unknown;
  rpcAllowed?: boolean;
}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  return {
    from: vi.fn((table: string) => {
      if (table === "audit_shares") return selectChain({ data: opts.share ?? null, error: null });
      if (table === "audits") return selectChain({ data: opts.audit ?? null, error: null });
      if (table === "leads") return { insert };
      throw new Error(`Unexpected table in test: ${table}`);
    }),
    rpc: vi.fn(async () => ({
      data: [{ allowed: opts.rpcAllowed ?? true, current_count: 1 }],
      error: null,
    })),
    _insert: insert,
  };
}

function formDataFor(overrides: Record<string, string | undefined> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    share_token: "a".repeat(24),
    name: "Prospective Customer",
    email: "prospect@example.com",
    phone: "",
    business_name: "",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v !== undefined) fd.set(k, v);
  }
  fd.set("consent_marketing", "on");
  return fd;
}

describe("submitLeadAction — share-token resolution (spec #3 fix, hardening §57)", () => {
  beforeEach(() => {
    mockCreateAdminClient.mockReset();
  });

  it("rejects a share token that does not resolve to any audit_shares row (forged/unknown token)", async () => {
    const client = makeFakeAdminClient({ share: null });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();
    // Never reaches the leads insert once the token fails to resolve.
    expect(client._insert).not.toHaveBeenCalled();
  });

  it("rejects a revoked (is_active: false) share token", async () => {
    const client = makeFakeAdminClient({
      share: { audit_id: "11111111-1111-1111-1111-111111111111", is_active: false, expires_at: null },
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBe("This shared report is no longer available.");
    expect(client._insert).not.toHaveBeenCalled();
  });

  it("rejects an expired share token even if is_active is still true", async () => {
    const client = makeFakeAdminClient({
      share: {
        audit_id: "11111111-1111-1111-1111-111111111111",
        is_active: true,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBe("This shared report is no longer available.");
    expect(client._insert).not.toHaveBeenCalled();
  });

  it("accepts a share token with a future expiry", async () => {
    const client = makeFakeAdminClient({
      share: {
        audit_id: "11111111-1111-1111-1111-111111111111",
        is_active: true,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      audit: { id: "11111111-1111-1111-1111-111111111111", owner_id: "owner-1", status: "completed" },
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.success).toBe(true);
  });

  it("rejects when the resolved audit is not completed (e.g. still processing/draft) — a forged/stale audit ID cannot be used for lead capture", async () => {
    const client = makeFakeAdminClient({
      share: { audit_id: "11111111-1111-1111-1111-111111111111", is_active: true, expires_at: null },
      audit: { id: "11111111-1111-1111-1111-111111111111", owner_id: "owner-1", status: "processing" },
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBe("This audit is not available for lead capture.");
    expect(client._insert).not.toHaveBeenCalled();
  });

  it("rejects when the share row points at an audit_id that no longer exists (dangling/deleted audit)", async () => {
    const client = makeFakeAdminClient({
      share: { audit_id: "11111111-1111-1111-1111-111111111111", is_active: true, expires_at: null },
      audit: null,
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBe("This audit is not available for lead capture.");
    expect(client._insert).not.toHaveBeenCalled();
  });

  it("on success, derives owner_id from the server-resolved audit row — never from client input (client cannot supply owner_id at all: the schema has no such field)", async () => {
    const client = makeFakeAdminClient({
      share: { audit_id: "11111111-1111-1111-1111-111111111111", is_active: true, expires_at: null },
      audit: { id: "11111111-1111-1111-1111-111111111111", owner_id: "real-owner-id", status: "completed" },
    });
    mockCreateAdminClient.mockReturnValue(client);

    await submitLeadAction({}, formDataFor());
    expect(client._insert).toHaveBeenCalledWith(
      expect.objectContaining({ audit_id: "11111111-1111-1111-1111-111111111111", owner_id: "real-owner-id" })
    );
  });

  it("rejects malformed input before ever contacting the database (schema validation runs first)", async () => {
    const client = makeFakeAdminClient({});
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor({ email: "not-an-email" }));
    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("fails closed (returns an error, does not insert) when the leads insert itself errors", async () => {
    const client = makeFakeAdminClient({
      share: { audit_id: "11111111-1111-1111-1111-111111111111", is_active: true, expires_at: null },
      audit: { id: "11111111-1111-1111-1111-111111111111", owner_id: "owner-1", status: "completed" },
      insertError: { message: "insert failed" },
    });
    mockCreateAdminClient.mockReturnValue(client);

    const result = await submitLeadAction({}, formDataFor());
    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();
  });
});
