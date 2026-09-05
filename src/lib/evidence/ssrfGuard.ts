import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { isPrivateOrReservedIp } from "./ipRangeCheck";

/**
 * SSRF protection for the server-side website fetcher (spec §54, §91).
 * Blocks localhost, private/reserved IP ranges, link-local (which covers
 * the 169.254.169.254 cloud metadata endpoint), and non-http(s) schemes —
 * checked both on the initial URL and on every redirect hop, since a
 * remote server can redirect to an internal address after DNS on the
 * original hostname passed.
 *
 * The pure IP-classification logic lives in ./ipRangeCheck.ts (no
 * "server-only" import there) so it can be unit tested directly.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0", "::1"]);

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export { isPrivateOrReservedIp, isIpInCidr, ipToLong, BLOCKED_IPV4_CIDRS } from "./ipRangeCheck";

export interface SafeUrlCheckResult {
  ok: boolean;
  reason?: string;
  resolvedIp?: string;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<SafeUrlCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "This host is not allowed." };
  }

  // If the hostname is itself a literal IP, check it directly; otherwise
  // resolve it and check every returned address (DNS can return multiple,
  // and an attacker-controlled domain could return a private address).
  const literalIpVersion = net.isIP(hostname);
  try {
    const addresses =
      literalIpVersion !== 0 ? [hostname] : (await dns.lookup(hostname, { all: true })).map((a) => a.address);

    if (addresses.length === 0) {
      return { ok: false, reason: "Could not resolve this host." };
    }

    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr)) {
        return { ok: false, reason: "This host resolves to a private or reserved address.", resolvedIp: addr };
      }
    }

    return { ok: true, resolvedIp: addresses[0] };
  } catch {
    return { ok: false, reason: "Could not resolve this host." };
  }
}
