import { describe, it, expect, vi, beforeEach } from "vitest";

// Email verification (spec: "does the software have it?"). Two things
// under test here, both gated behind Supabase's project-level "Confirm
// email" setting — the app supports either state, but these tests cover
// the branch that only matters when it's ON:
//
//  1. signInAction must not tell a real user with an unconfirmed email
//     that their password is wrong (misleading and a dead end) — it should
//     recognize Supabase's `email_not_confirmed` error code and say so,
//     handing back the submitted email so the UI can offer a resend.
//  2. resendConfirmationAction must call supabase.auth.resend({ type:
//     "signup", ... }) and always return the same generic message,
//     regardless of whether the address exists or is already confirmed —
//     same email-enumeration rationale as forgotPasswordAction.

const mockSignInWithPassword = vi.fn();
const mockResend = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mockSignInWithPassword, resend: mockResend },
  }),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMITS: {
    signup: { limit: 5, windowSeconds: 3600 },
    signin: { limit: 10, windowSeconds: 900 },
    forgotPassword: { limit: 5, windowSeconds: 3600 },
    resendConfirmation: { limit: 5, windowSeconds: 3600 },
  },
}));

async function callSignIn(formEntries: Record<string, string>) {
  const { signInAction } = await import("@/lib/actions/auth");
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) formData.set(key, value);
  return signInAction({}, formData);
}

async function callResend(formEntries: Record<string, string>) {
  const { resendConfirmationAction } = await import("@/lib/actions/auth");
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) formData.set(key, value);
  return resendConfirmationAction({}, formData);
}

const credentials = { email: "unconfirmed@brandsight-livetest.test", password: "SomeValidPassword123!" };

describe("signInAction — unconfirmed-email handling", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignInWithPassword.mockReset();
    mockCheckRateLimit.mockReset();
    mockRedirect.mockClear();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("tells the user to confirm their email — not that the password is wrong — on error code email_not_confirmed", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });

    const result = await callSignIn(credentials);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "Please confirm your email before signing in.",
      needsConfirmation: true,
      submittedEmail: credentials.email,
    });
  });

  it("still returns the generic incorrect-credentials message for any other sign-in error", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    const result = await callSignIn(credentials);

    expect(result).toEqual({ error: "Incorrect email or password." });
    expect(result).not.toHaveProperty("needsConfirmation");
  });

  it("redirects to /dashboard on a successful sign-in, unaffected by the new branch", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: { access_token: "tok" } }, error: null });

    await expect(callSignIn(credentials)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});

describe("resendConfirmationAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockResend.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  it("calls supabase.auth.resend with type 'signup' and the submitted email", async () => {
    mockResend.mockResolvedValue({ error: null });

    await callResend({ email: "someone@example.com" });

    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: "someone@example.com" })
    );
  });

  it("returns the same generic message whether or not the resend call itself errors (no email enumeration)", async () => {
    mockResend.mockResolvedValue({ error: { message: "User not found" } });
    const notFoundResult = await callResend({ email: "nobody@example.com" });

    mockResend.mockResolvedValue({ error: null });
    const okResult = await callResend({ email: "someone@example.com" });

    expect(notFoundResult).toEqual(okResult);
    expect(notFoundResult.success).toBeTruthy();
  });

  it("rejects invalid input before ever calling Supabase", async () => {
    const result = await callResend({ email: "not-an-email" });

    expect(mockResend).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Enter a valid email" });
  });

  it("blocks the attempt when rate limited, without calling Supabase", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    const result = await callResend({ email: "someone@example.com" });

    expect(mockResend).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Too many attempts. Please try again later." });
  });
});
