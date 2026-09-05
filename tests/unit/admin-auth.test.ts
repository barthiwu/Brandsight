import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// adminAuth.ts does `import "server-only"`, which throws unconditionally
// outside Next's bundler — see the same pattern in lead-capture-action.test.ts.
vi.mock("server-only", () => ({}));

const { isAdminEmail } = await import("@/lib/security/adminAuth");

/**
 * Server-side admin allowlist (spec §73). This is the ONLY gate standing
 * between an ordinary signed-in user and every /admin/* page (see
 * src/app/admin/layout.tsx, which redirects to /dashboard when this
 * returns false) — the named "non-admin accessing admin" security test
 * from the hardening pass §57 list lives here at the unit level.
 */
describe("isAdminEmail", () => {
  const ORIGINAL_ENV = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "owner@brandsight.example, second-admin@brandsight.example";
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV;
  });

  it("allows an email on the allowlist", () => {
    expect(isAdminEmail("owner@brandsight.example")).toBe(true);
  });

  it("denies an ordinary user's email not on the allowlist (the core case)", () => {
    expect(isAdminEmail("regular-user@example.com")).toBe(false);
  });

  it("is case-insensitive on both sides", () => {
    expect(isAdminEmail("Owner@BrandSight.Example")).toBe(true);
  });

  it("denies null/undefined/empty email rather than throwing", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("does not match on partial/substring overlap (e.g. a subdomain or lookalike address)", () => {
    expect(isAdminEmail("owner@brandsight.example.evil.com")).toBe(false);
    expect(isAdminEmail("notowner@brandsight.example")).toBe(false);
  });

  it("denies everyone when ADMIN_EMAILS is unset (fails closed, not open)", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("owner@brandsight.example")).toBe(false);
  });

  it("denies everyone when ADMIN_EMAILS is set but empty/whitespace", () => {
    process.env.ADMIN_EMAILS = "   ";
    expect(isAdminEmail("owner@brandsight.example")).toBe(false);
  });

  it("tolerates stray whitespace around entries in the allowlist", () => {
    process.env.ADMIN_EMAILS = "  spaced-admin@example.com  ,other@example.com";
    expect(isAdminEmail("spaced-admin@example.com")).toBe(true);
  });
});
