import "server-only";

/**
 * Cloudflare Turnstile bot-protection check for signup — there was
 * previously no bot protection anywhere in the app: no CAPTCHA, no
 * per-IP throttling, just a per-email rate limit (5/hour), which does
 * nothing against an abuser rotating throwaway addresses. Turnstile was
 * chosen because it has a genuinely free tier and a privacy-friendlier
 * default mode than reCAPTCHA.
 *
 * Inert by design until configured: with TURNSTILE_SECRET_KEY unset,
 * this always returns true (verification "disabled", not "failing
 * open" on a real check) — signup keeps working exactly as it does
 * today, including in this environment and any dev/test setup, with
 * zero behavior change. Getting a real site key + secret key requires a
 * (free) Cloudflare account — that's the one step this code can't do on
 * its own. See .env.example for both env vars and
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY, which SignUpForm.tsx uses to decide
 * whether to render the widget at all.
 */
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // feature disabled — nothing to check against

  if (!token) return false; // feature enabled, but the form submitted with no token at all

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch {
    // A Cloudflare-side outage or network hiccup shouldn't itself block
    // every signup — fail open on infrastructure trouble, same posture
    // as the rest of this app's best-effort external calls (Resend
    // notifications, etc.), just for a check rather than a notification.
    return true;
  }
}
