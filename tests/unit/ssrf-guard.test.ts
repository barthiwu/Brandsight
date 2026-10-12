import { describe, expect, it, vi } from "vitest";
import { ipToLong, isIpInCidr, isPrivateOrReservedIp, BLOCKED_IPV4_CIDRS } from "@/lib/evidence/ipRangeCheck";

// ssrfGuard.ts does `import "server-only"`, which throws outside Next's
// own bundler — stub it so assertSafeExternalUrl can be exercised
// directly under plain vitest (same pattern used elsewhere in this
// suite, e.g. website-fetcher-redirect.test.ts).
vi.mock("server-only", () => ({}));
const { assertSafeExternalUrl } = await import("@/lib/evidence/ssrfGuard");

describe("ipToLong", () => {
  it("converts a dotted-quad IPv4 address to its 32-bit integer form", () => {
    expect(ipToLong("0.0.0.0")).toBe(0);
    expect(ipToLong("255.255.255.255")).toBe(0xffffffff);
    expect(ipToLong("192.168.1.1")).toBe(((192 << 24) + (168 << 16) + (1 << 8) + 1) >>> 0);
  });
});

describe("isIpInCidr", () => {
  it("matches addresses inside the given range", () => {
    expect(isIpInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(isIpInCidr("192.168.50.1", "192.168.0.0/16")).toBe(true);
    expect(isIpInCidr("169.254.169.254", "169.254.0.0/16")).toBe(true);
  });

  it("rejects addresses outside the given range", () => {
    expect(isIpInCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(isIpInCidr("192.169.0.1", "192.168.0.0/16")).toBe(false);
  });

  it("handles a /0 range (matches everything)", () => {
    expect(isIpInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });
});

describe("isPrivateOrReservedIp", () => {
  it("blocks loopback addresses", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("127.255.255.255")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.254")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });

  it("blocks the link-local range, including the cloud metadata address", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.0.1")).toBe(true);
  });

  it("blocks carrier-grade NAT, benchmarking, multicast, and reserved ranges", () => {
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("198.18.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("224.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("240.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("0.0.0.1")).toBe(true);
  });

  it("allows ordinary public IPv4 addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
  });

  it("blocks IPv6 loopback, unspecified, link-local, and unique-local addresses", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("::")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd12:3456::1")).toBe(true);
  });

  it("unwraps IPv4-mapped IPv6 addresses and checks the embedded v4 address itself", () => {
    // A previous version blocked every ::ffff: address outright — safe,
    // but for the wrong reason, and it would have falsely rejected a
    // legitimate public site whose DNS returned a mapped address. The
    // embedded address is what actually matters.
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("blocks the NAT64 well-known prefix and 6to4 addresses (can smuggle a private v4 address we don't unwrap)", () => {
    expect(isPrivateOrReservedIp("64:ff9b::8.8.8.8")).toBe(true);
    expect(isPrivateOrReservedIp("2002:c000:0204::1")).toBe(true);
  });

  it("allows ordinary public IPv6 addresses", () => {
    expect(isPrivateOrReservedIp("2001:4860:4860::8888")).toBe(false);
  });

  it("fails closed for unrecognized/invalid input", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
    expect(isPrivateOrReservedIp("")).toBe(true);
  });

  it("has no overlapping documentation gaps in BLOCKED_IPV4_CIDRS (sanity check on the constant itself)", () => {
    expect(BLOCKED_IPV4_CIDRS.length).toBeGreaterThan(0);
    for (const cidr of BLOCKED_IPV4_CIDRS) {
      expect(cidr).toMatch(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/);
    }
  });
});

describe("assertSafeExternalUrl — bracketed IPv6 literals", () => {
  // These are all literal-IP URLs, so assertSafeExternalUrl takes the
  // net.isIP() short-circuit and never needs a real DNS lookup — safe to
  // run in any sandbox, unlike the hostname-based redirect tests.
  //
  // Regression coverage for a real bug fixed alongside the DNS-rebinding
  // pinning fix: new URL("http://[::1]/").hostname is the *bracketed*
  // string "[::1]", which neither BLOCKED_HOSTNAMES nor net.isIP()
  // recognized — so every bracketed IPv6-literal URL fell through to a
  // DNS lookup of the literal text "[::1]", which always fails and was
  // reported as "Could not resolve this host." That failed *closed* (so
  // it was never an SSRF bypass), but it silently rejected every
  // legitimate IPv6-literal URL and meant the carefully-written IPv6
  // branch of isPrivateOrReservedIp was unreachable from real URLs.

  it("blocks a bracketed IPv6 loopback literal, by its actual reason rather than a bare DNS failure", async () => {
    const result = await assertSafeExternalUrl("http://[::1]/");
    expect(result.ok).toBe(false);
    // "::1" is explicitly in BLOCKED_HOSTNAMES, so this is rejected a step
    // earlier than the private/reserved-IP check below — either way, the
    // point of this regression test is that it's rejected for the real
    // reason rather than falling through to a DNS lookup of the literal
    // string "[::1]" and failing with "Could not resolve this host."
    expect(result.reason).toMatch(/not allowed/i);
  });

  it("blocks a bracketed IPv6 unique-local literal (e.g. an internal service)", async () => {
    const result = await assertSafeExternalUrl("http://[fd12:3456:789a::1]/");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/private or reserved address/i);
  });

  it("blocks a bracketed link-local literal (covers the IPv6 metadata-style address space)", async () => {
    const result = await assertSafeExternalUrl("http://[fe80::1]/");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/private or reserved address/i);
  });

  it("allows a bracketed, ordinary public IPv6 literal", async () => {
    const result = await assertSafeExternalUrl("http://[2001:4860:4860::8888]/");
    expect(result.ok).toBe(true);
    expect(result.resolvedIp).toBe("2001:4860:4860::8888");
  });
});
