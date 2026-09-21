import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Devil's-advocate follow-up: there was no bot protection anywhere in
// the app — no CAPTCHA, only a per-email signup rate limit, which does
// nothing against an abuser rotating throwaway addresses. Turnstile
// support is wired up but stays completely inert until
// TURNSTILE_SECRET_KEY is actually configured (requires a free
// Cloudflare account — the one step this code can't do on its own), so
// these tests cover both states: disabled (today, everywhere) and
// enabled (once configured).

vi.mock("server-only", () => ({}));

const originalFetch = global.fetch;

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("is a no-op (always verified) when TURNSTILE_SECRET_KEY is unset — today's default, everywhere", async () => {
    const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
    global.fetch = vi.fn();

    await expect(verifyTurnstileToken(null)).resolves.toBe(true);
    await expect(verifyTurnstileToken("some-token")).resolves.toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("once enabled, rejects a missing token without even calling Cloudflare", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
    global.fetch = vi.fn();

    await expect(verifyTurnstileToken(null)).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("once enabled, verifies a real token against Cloudflare's siteverify endpoint", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const mockFetch = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
    const result = await verifyTurnstileToken("real-token");

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("once enabled, rejects when Cloudflare says the token is invalid", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }) as unknown as typeof fetch;

    const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
    await expect(verifyTurnstileToken("bad-token")).resolves.toBe(false);
  });

  it("fails open (doesn't block signup) if the Cloudflare call itself errors", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    global.fetch = vi.fn().mockRejectedValue(new Error("network error")) as unknown as typeof fetch;

    const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
    await expect(verifyTurnstileToken("some-token")).resolves.toBe(true);
  });
});
