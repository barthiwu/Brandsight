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
 * (spec §76-77) and the `check_and_record_rate_limit` SECURITY DEFINER
 * function (migration 0008). Every AI-cost-incurring or abuse-prone action
 * in this codebase (signup, signin, audit creation, audit processing,
 * website fetch, uploads, share link generation, lead capture) calls this
 * before doing real work.
 *
 * The count-check and the insert happen inside a single database function
 * call, serialized per bucket_key with a transaction-scoped advisory lock
 * (hardening pass §19/§57 — "atomic rate limiting"). The original V1
 * implementation issued a separate SELECT count and INSERT from the
 * application, which raced under concurrent requests for the same bucket:
 * multiple callers could each observe "under limit" before any of them
 * recorded their event, letting the effective limit be exceeded.
 *
 * Fails OPEN on infrastructure errors (a Supabase outage should not take
 * the whole app down) but logs loudly so it's visible in server logs.
 */
export async function checkRateLimit(bucketKey: string, options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("check_and_record_rate_limit", {
      p_bucket_key: bucketKey,
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    });

    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error("check_and_record_rate_limit returned no rows.");

    return { allowed: row.allowed, remaining: Math.max(0, options.limit - row.current_count) };
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
