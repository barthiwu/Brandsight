/**
 * Validates a client-supplied "redirect back to here after login" path
 * (spec: post-login redirect) against open-redirect abuse.
 *
 * Bug this fixes: signInAction previously accepted any value whose raw
 * string happened to start with "/", on the theory that a relative path
 * can't leave the site. That's true for "/dashboard" but false for
 * "//evil.com" — a protocol-relative URL, which also starts with "/" but
 * which a browser resolves as "same scheme, different host." Backslash
 * variants ("\\evil.com", "/\\evil.com") are an equivalent bypass: the
 * WHATWG URL spec (what browsers and Node's URL both implement) treats a
 * leading backslash the same as a leading forward slash.
 *
 * Attack this closes: a phishing link like
 * "https://brandsight.app/login?redirectTo=//attacker.example/phish" logs
 * the victim in for real against the real site (so nothing looks wrong
 * up to that point), then silently lands them on an attacker-controlled
 * page that can impersonate BrandSight to harvest credentials again, show
 * a fake "session expired" prompt, etc.
 *
 * Rather than trying to enumerate every bypass string by hand, this
 * resolves the value against an arbitrary fixed base origin and checks
 * whether the result's origin changed at all — which is exactly what
 * "did this redirect to a different host" means, and is robust to
 * encoding tricks and backslash normalization because it relies on the
 * same URL parser a browser uses, not a regex guessing at one.
 */
const SAFE_REDIRECT_BASE = "http://same-origin.invalid";

export function safeRedirectPath(value: FormDataEntryValue | string | null, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(value, SAFE_REDIRECT_BASE);
  } catch {
    return fallback;
  }

  if (resolved.origin !== SAFE_REDIRECT_BASE) return fallback;
  // Belt-and-suspenders, and keeps the contract explicit: only ever
  // redirect to a same-origin path that actually starts with "/".
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  return value;
}
