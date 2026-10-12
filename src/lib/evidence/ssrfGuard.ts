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

  // url.hostname keeps the surrounding brackets for a literal IPv6 host
  // (new URL("http://[::1]/").hostname === "[::1]"), which neither
  // BLOCKED_HOSTNAMES nor net.isIP()/dns.lookup() recognize as the bare
  // address "::1" — so a bracketed IPv6 literal fell through to a DNS
  // lookup of the literal string "[::1]", which always fails and gets
  // reported as "Could not resolve this host." That still fails *closed*
  // (nothing gets through), so it was never a bypass, but it means every
  // legitimate IPv6-literal URL was wrongly rejected, and the IPv6 branch
  // of isPrivateOrReservedIp was unreachable from this path. Strip the
  // brackets before any check so a bracketed literal is classified the
  // same way an unbracketed one or a DNS-resolved IPv6 address is.
  const hostname = url.hostname.toLowerCase().replace(/^\[(.+)\]$/, "$1");
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
