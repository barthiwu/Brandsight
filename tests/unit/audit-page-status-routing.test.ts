import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for a real bug found during live E2E testing (see
// tests/e2e/happy-path.spec.ts and HARDENING_REPORT.md): src/components/audit/ProcessingView.tsx
// is the actual trigger for the AI pipeline — it POSTs to
// /api/audits/[auditId]/process on mount, and that route is the only code
// path that ever runs the pipeline. But this page used to group audit
// status "ready" together with "draft" and render the onboarding wizard
// for both, so ProcessingView never mounted, its trigger fetch never
// fired, and a submitted audit sat at "ready" forever — the user just saw
// the same wizard again. Caught live: the E2E happy-path spec got all the
// way through signup, brand creation, and the full wizard, then landed
// back on the wizard instead of a processing/report screen.
//
// This test exercises the page's status -> view routing directly (a
// server component is just an async function returning a React element
// tree — no renderer needed to inspect `.type`/`.props`) rather than only
// exercising the "happy" draft path, so this exact class of bug — right
// component logic, wrong routing condition — gets caught without needing
// a live Supabase project.

// This page transitively imports something (AuditOverview and/or the
// server actions passed to DeleteAuditButton) that does `import
// "server-only"` — that package unconditionally throws unless resolved
// under Next's `react-server` export condition, so it can't be imported
// for real inside plain vitest. Same fix as tests/unit/lead-capture-action.test.ts.
vi.mock("server-only", () => ({}));

const state: { audit: Record<string, unknown> | null; brand: Record<string, unknown> } = {
  audit: null,
  brand: { id: "brand-1", name: "Test Brand" },
};

function makeQueryResult(data: unknown) {
  const result = { data, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "audits") return makeQueryResult(state.audit);
      if (table === "brands") return makeQueryResult(state.brand);
      // audit_responses / competitors / social_profiles — unused by these
      // status-routing cases beyond "draft", empty is fine.
      return makeQueryResult([]);
    },
  }),
}));

async function renderAuditPage(auditId = "audit-1") {
  const { default: AuditPage } = await import("@/app/(app)/audits/[auditId]/page");
  return AuditPage({ params: Promise.resolve({ auditId }) });
}

/** Finds the first element in a (possibly wrapping-div) tree whose
 * component function name matches, so this doesn't care whether the page
 * returns the component directly or wraps it in a <div> with a heading. */
function findComponentName(element: unknown): string | undefined {
  if (!element || typeof element !== "object") return undefined;
  const el = element as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === "function") {
    const name = (el.type as { name?: string }).name;
    if (name && name !== "div") return name;
  }
  const children = el.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findComponentName(child);
    if (found) return found;
  }
  return undefined;
}

describe("AuditPage status routing", () => {
  beforeEach(() => {
    vi.resetModules();
    state.audit = null;
  });

  it("renders the onboarding wizard for a draft audit", async () => {
    state.audit = { id: "audit-1", status: "draft", brand_id: "brand-1", audit_type: "quick" };
    const result = await renderAuditPage();
    expect(findComponentName(result)).toBe("OnboardingWizard");
  });

  it("renders ProcessingView (which triggers the pipeline) for a ready audit — the fix", async () => {
    state.audit = { id: "audit-1", status: "ready", brand_id: "brand-1", audit_type: "quick" };
    const result = await renderAuditPage();
    expect(findComponentName(result)).toBe("ProcessingView");
  });

  it("still renders ProcessingView for an audit already processing", async () => {
    state.audit = { id: "audit-1", status: "processing", brand_id: "brand-1", audit_type: "quick" };
    const result = await renderAuditPage();
    expect(findComponentName(result)).toBe("ProcessingView");
  });

  it("renders FailedView for a failed audit", async () => {
    state.audit = { id: "audit-1", status: "failed", brand_id: "brand-1", audit_type: "quick", processing_error: "boom" };
    const result = await renderAuditPage();
    expect(findComponentName(result)).toBe("FailedView");
  });
});
