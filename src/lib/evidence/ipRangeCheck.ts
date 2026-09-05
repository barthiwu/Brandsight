import net from "node:net";

/**
 * Pure, network-free IP-range classification used by the SSRF guard
 * (see ssrfGuard.ts). Split into its own module — with no "server-only"
 * import — so it can be unit tested directly without a server/component
 * bundling context.
 */

export function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

export const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // carrier-grade NAT
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local, includes cloud metadata (169.254.169.254)
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return BLOCKED_IPV4_CIDRS.some((cidr) => isIpInCidr(ip, cidr));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80:") || // link-local
      lower.startsWith("fc") ||
      lower.startsWith("fd") || // unique local
      lower.startsWith("::ffff:") // IPv4-mapped — validate the embedded v4 address too
    );
  }
  return true; // unrecognized — fail closed
}
