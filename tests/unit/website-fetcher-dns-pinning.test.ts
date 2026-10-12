import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

// Regression test for the DNS-rebinding fix in websiteFetcher.ts. Unlike
// tests/unit/website-fetcher-redirect.test.ts (which stubs global fetch
// entirely and so never exercises the real dispatcher/pinning code at
// all), this test leaves the real fetch in place and only mocks
// assertSafeExternalUrl, so the actual undici Agent + custom DNS lookup
// wired up in fetchWebsiteEvidence runs for real against a local server.
//
// The hostname used below (a .invalid TLD) has no real DNS record
// whatsoever. If fetchWebsiteEvidence's request ever fell back to a real
// DNS lookup of that hostname — exactly what the previous, unpinned
// `fetch(currentUrl, {...})` call did, independently of the SSRF guard's
// own earlier lookup — the request would fail with ENOTFOUND. The fact
// that it instead succeeds and reaches the local server proves the
// request was actually pinned to the address the guard approved, not
// re-resolved at connect time. That re-resolution gap is exactly what a
// DNS-rebinding attacker relies on: return a public address for the
// guard's check, then a private/internal one a moment later for the real
// request.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/evidence/ssrfGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evidence/ssrfGuard")>();
  return { ...actual, assertSafeExternalUrl: vi.fn() };
});

const { fetchWebsiteEvidence } = await import("@/lib/evidence/websiteFetcher");
const { assertSafeExternalUrl } = await import("@/lib/evidence/ssrfGuard");

describe("fetchWebsiteEvidence — DNS-rebinding pin (real fetch, real dispatcher)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("connects to the exact address the SSRF guard approved, never to whatever (if anything) the hostname really resolves to", async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end("<html><head><title>Pinned</title></head><body>Reached the real target</body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      vi.mocked(assertSafeExternalUrl).mockResolvedValue({ ok: true, resolvedIp: "127.0.0.1" });

      // This hostname has no real DNS record at all — a plain fetch()
      // with no pinning would throw ENOTFOUND.
      const result = await fetchWebsiteEvidence(`http://this-domain-does-not-exist-anywhere.invalid:${port}/`);

      expect(result.status).toBe("fetched");
      expect(result.title).toBe("Pinned");
    } finally {
      server.close();
    }
  });

  it("still fails closed when the guard rejects the URL, without ever attempting a request", async () => {
    vi.mocked(assertSafeExternalUrl).mockResolvedValue({ ok: false, reason: "This host resolves to a private or reserved address." });

    const result = await fetchWebsiteEvidence("http://this-domain-does-not-exist-anywhere.invalid/");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/private or reserved address/i);
  });
});
