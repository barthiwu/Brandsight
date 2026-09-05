import { afterEach, describe, expect, it, vi } from "vitest";

// websiteFetcher.ts (and its ssrfGuard.ts dependency) do `import "server-only"`.
// Mocking the package (same pattern as lead-capture-action.test.ts and
// admin-auth.test.ts) lets the real fetch/redirect/SSRF-check logic run
// under plain vitest. assertSafeExternalUrl() needs no real DNS lookup for
// a literal-IP hostname (net.isIP short-circuits it), so a malicious
// redirect straight to an IP literal like the cloud metadata address can be
// exercised fully offline.
vi.mock("server-only", () => ({}));

const { fetchWebsiteEvidence } = await import("@/lib/evidence/websiteFetcher");

function htmlResponse(html: string) {
  return {
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    body: undefined,
    text: async () => html,
  } as unknown as Response;
}

function redirectResponse(location: string) {
  return {
    status: 302,
    ok: false,
    headers: new Headers({ location }),
    body: undefined,
    text: async () => "",
  } as unknown as Response;
}

describe("fetchWebsiteEvidence — malicious redirect handling (spec §54/§91, hardening §57 named test)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does NOT follow a redirect to the cloud-metadata link-local address, and fails closed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirectResponse("http://169.254.169.254/latest/meta-data/"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://example.com");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/private or reserved address/i);
    // Only the first hop was ever requested — the malicious redirect target
    // was rejected by the SSRF check before a second fetch could happen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT follow a redirect to a literal private IPv4 address (e.g. an internal admin panel)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirectResponse("http://10.0.0.5/internal-admin"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://example.com");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/private or reserved address/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT follow a redirect to localhost", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirectResponse("http://localhost:5432/"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://example.com");

    expect(result.status).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("DOES follow a legitimate redirect chain to another public address and parses the final page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.34/new-location"))
      .mockResolvedValueOnce(htmlResponse("<html><head><title>Landed</title></head><body>Hello</body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://example.com/old");

    expect(result.status).toBe("fetched");
    expect(result.title).toBe("Landed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after MAX_REDIRECTS hops rather than following an unbounded/looping redirect chain", async () => {
    // Every hop redirects to another distinct public address, so each one
    // individually passes the SSRF check — this is purely testing the hop
    // count cap, independent of the SSRF logic covered by the tests above.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.1/1"))
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.2/2"))
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.3/3"))
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.4/4"))
      .mockResolvedValueOnce(redirectResponse("https://93.184.216.5/5"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://93.184.216.0/start");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/too many redirects/i);
  });

  it("fails closed when a redirect response has no Location header at all", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({}),
      body: undefined,
      text: async () => "",
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWebsiteEvidence("https://example.com");
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/without a destination/i);
  });
});
