import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP for a secondary, IP-keyed rate-limit bucket.
 *
 * Why this exists: every auth rate limit in this codebase (signup,
 * sign-in, forgot-password, resend-confirmation) was keyed only by the
 * email address the request itself supplied. An attacker who rotates
 * through disposable addresses gets a fresh bucket every time — each one
 * individually under its "5/hour" or "10/15min" cap — so the *effective*
 * limit for one attacker was unbounded. The fix is a second bucket keyed
 * by IP, checked alongside the per-email one, so rotating the email can
 * no longer reset the limiter.
 *
 * Trust model: `x-forwarded-for` is, in general, fully attacker-
 * controllable — a client can send any value it likes. It's only safe to
 * read here because this app is deployed behind a platform-managed edge
 * (Render) that overwrites/appends to this header itself rather than
 * passing through whatever the client sent unmodified; the *first*
 * address in the resulting list is the one the edge recorded for the
 * inbound connection. If this is ever deployed behind a different proxy
 * setup where that isn't true, this stops being a meaningful signal — it
 * degrades to "no IP bucket" (returns null, rate limiting still falls
 * back to the per-email bucket alone) rather than trusting a spoofable
 * value, since the caller treats a null IP as "skip the IP check."
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for");
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = h.get("x-real-ip");
    if (realIp) return realIp.trim();
    return null;
  } catch {
    return null;
  }
}
