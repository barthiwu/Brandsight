import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for a real bug found during live E2E testing (see
// tests/e2e/happy-path.spec.ts and HARDENING_REPORT.md): signUpAction used
// to always return the static "check your email to confirm" message and
// never redirect, even when Supabase actually returned a live session
// (which it does whenever the project's "Confirm email" setting is off —
// true of any dev/test project, and an option some production projects use
// too). SignUpForm.tsx treats `state.success` as terminal, so the browser
// was left stuck on /signup forever instead of landing on /dashboard.

const mockSignUp = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signUp: mockSignUp },
  }),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

async function callSignUp(formEntries: Record<string, string>) {
  const { signUpAction } = await import("@/lib/actions/auth");
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }
  return signUpAction({}, formData);
}

const validForm = {
  fullName: "E2E Test User",
  email: "signup-test@brandsight-livetest.test",
  password: "SomeValidPassword123!",
};

describe("signUpAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignUp.mockReset();
    mockCheckRateLimit.mockReset();
    mockRedirect.mockClear();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  it("redirects to /dashboard when Supabase returns a live session (email confirmation off / auto-confirmed)", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: "fake-token" }, user: { id: "user-1" } },
      error: null,
    });

    await expect(callSignUp(validForm)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the check-your-email message without redirecting when no session comes back (email confirmation required)", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: "user-1" } },
      error: null,
    });

    const result = await callSignUp(validForm);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({ success: "Check your email to confirm your account, then sign in." });
  });

  it("returns the Supabase error message and never redirects when signUp fails", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered" },
    });

    const result = await callSignUp(validForm);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "User already registered" });
  });

  it("rejects invalid input before ever calling Supabase", async () => {
    const result = await callSignUp({ ...validForm, email: "not-an-email" });

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Enter a valid email" });
  });

  it("blocks the attempt when rate limited, without calling Supabase", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    const result = await callSignUp(validForm);

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Too many attempts. Please try again later." });
  });
});
