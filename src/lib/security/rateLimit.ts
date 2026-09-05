import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitOptions {
  /** Max events allowed inside the window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window rate limiter backed by the `rate_limit_events` table
 * (spec §76-77). Simple by design for V1 — no Redis/Upstash dependency to
 * provision — at the cost of an extra DB round trip per checked action.
 * Every AI-cost-incurring or abuse-prone action in this codebase (signup,
 * signin, audit creation, audit processing, website fetch, uploads, share
 * link generation, lead capture) calls this before doing real work.
 *
 * Fails OPEN on infrastructure errors (a Supabase outage should not take
 * the whole app down) but logs loudly so it's visible in server logs.
 */
export async function checkRateLimit(bucketKey: string, options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const windowStart = new Date(Date.now() - options.windowSeconds * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("bucket_key", bucketKey)
      .gte("created_at", windowStart);

    if (countError) throw countError;

    if ((count ?? 0) >= options.limit) {
      return { allowed: false, remaining: 0 };
    }

    const { error: insertError } = await supabase.from("rate_limit_events").insert({ bucket_key: bucketKey });
    if (insertError) throw insertError;

    return { allowed: true, remaining: Math.max(0, options.limit - (count ?? 0) - 1) };
  } catch (err) {
    console.error("[rateLimit] check failed, failing open", { bucketKey, err });
    return { allowed: true, remaining: options.limit };
  }
}

/** Common named limits, so call sites read declaratively (spec §76). */
export const RATE_LIMITS = {
  signup: { limit: 5, windowSeconds: 3600 },
  signin: { limit: 10, windowSeconds: 900 },
  forgotPassword: { limit: 5, windowSeconds: 3600 },
  auditCreate: { limit: 10, windowSeconds: 3600 },
  auditProcess: { limit: 5, windowSeconds: 3600 },
  websiteFetch: { limit: 20, windowSeconds: 3600 },
  assetUpload: { limit: 30, windowSeconds: 3600 },
  shareGenerate: { limit: 20, windowSeconds: 3600 },
  leadSubmit: { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitOptions>;
