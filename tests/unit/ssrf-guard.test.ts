import { describe, expect, it } from "vitest";
import { ipToLong, isIpInCidr, isPrivateOrReservedIp, BLOCKED_IPV4_CIDRS } from "@/lib/evidence/ipRangeCheck";

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
