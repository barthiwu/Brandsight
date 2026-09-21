import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { isThinContent } from "@/lib/evidence/websiteFetcher";
import { estimateCostUsd } from "@/lib/ai/costEstimate";

export const metadata = { title: "Admin — System" };
export const dynamic = "force-dynamic";

const MAX_CONCURRENT_AUDITS = Number(process.env.MAX_CONCURRENT_AUDITS ?? 3);

// Kept as a plain (lowercase, non-component) async function rather than
// inline in the page body: computing "now" is inherently impure, and the
// React Compiler's purity lint rule flags impure calls made directly
// inside a component/hook body. This page is a Server Component that runs
// once per request on the server — there's no client re-render to
// destabilize — but isolating the clock read here keeps the component
// body itself pure and sidesteps the false positive.
async function loadSystemStats() {
  const supabase = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [
    { count: failedAudits },
    { data: recentFailedAudits },
    { count: failedWebsiteFetches },
    { count: rateLimitEventsLastHour },
    { count: currentlyProcessing },
    { count: admittedOverCapacityCount },
    { data: usageRowsLast24h },
    { data: fetchedWebsiteRows },
  ] = await Promise.all([
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("audits").select("id, processing_error, updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(10),
    supabase.from("website_sources").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("rate_limit_events").select("*", { count: "exact", head: true }).gte("created_at", oneHourAgo),
    // Live capacity gauge — the same "in flight" count
    // try_lock_audit_processing (migration 0009) checks atomically
    // before admitting a new audit.
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "processing"),
    // Lifetime count of audits that had to wait out the full capacity
    // window and got admitted anyway (see the process route's
    // acquireProcessingSlot) — a sustained run of these means the
    // instance needs more headroom, not just a longer wait.
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("admitted_over_capacity", true),
    // Real per-audit AI token usage (migration 0009 / usageTracking.ts),
    // last 24h. Capped at Supabase's default row limit — fine for a
    // monitoring dashboard at V1's expected volume; would need a
    // server-side SUM (a view or RPC) to stay accurate at real scale.
    supabase
      .from("audits")
      .select("ai_input_tokens, ai_output_tokens, ai_estimated_cost_usd")
      .not("ai_input_tokens", "is", null)
      .gte("updated_at", oneDayAgo),
    // Real fetched website_sources rows, to compute how many came back
    // "thin" (see websiteFetcher.ts's isThinContent) — not a stored
    // column, so this has to be recomputed here rather than counted with
    // a WHERE clause. Capped defensively; a rough signal, not an exact
    // lifetime count once volume grows well past this limit.
    supabase
      .from("website_sources")
      .select("title, description, headings, body_text, cta_text, trust_signals")
      .eq("status", "fetched")
      .limit(500),
  ]);

  const usage24h = (usageRowsLast24h ?? []).reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + (row.ai_input_tokens ?? 0),
      outputTokens: acc.outputTokens + (row.ai_output_tokens ?? 0),
      estimatedCostUsd: acc.estimatedCostUsd + (row.ai_estimated_cost_usd ?? 0),
      audits: acc.audits + 1,
    }),
    { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, audits: 0 }
  );
  // A real dollar figure only exists once OPENAI_*_PRICE_PER_1M are
  // configured (see costEstimate.ts) — otherwise every stored
  // ai_estimated_cost_usd is null and this stays null too, so the UI can
  // show "not configured" rather than a misleading $0.00.
  const costPricingConfigured = estimateCostUsd({ inputTokens: 0, outputTokens: 0 }) !== null;

  // isThinContent expects the same camelCase shape websiteFetcher.ts
  // produces (bodyText/ctaText/trustSignals) — these rows come straight
  // from the DB in snake_case, so they need the same field mapping
  // pipeline/context.ts's isThinWebsiteEvidence uses.
  const thinWebsiteCount = (fetchedWebsiteRows ?? []).filter((row) =>
    isThinContent({
      title: row.title,
      description: row.description,
      headings: row.headings,
      bodyText: row.body_text,
      ctaText: row.cta_text,
      trustSignals: row.trust_signals,
    })
  ).length;
  const fetchedWebsiteCount = fetchedWebsiteRows?.length ?? 0;

  return {
    failedAudits,
    recentFailedAudits,
    failedWebsiteFetches,
    rateLimitEventsLastHour,
    currentlyProcessing: currentlyProcessing ?? 0,
    admittedOverCapacityCount: admittedOverCapacityCount ?? 0,
    usage24h,
    costPricingConfigured,
    thinWebsiteCount,
    fetchedWebsiteCount,
  };
}

export default async function AdminSystemPage() {
  const {
    failedAudits,
    recentFailedAudits,
    failedWebsiteFetches,
    rateLimitEventsLastHour,
    currentlyProcessing,
    admittedOverCapacityCount,
    usage24h,
    costPricingConfigured,
    thinWebsiteCount,
    fetchedWebsiteCount,
  } = await loadSystemStats();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">System monitoring</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-(--color-text-secondary)">Failed audits (AI pipeline)</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">{failedAudits ?? 0}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-(--color-text-secondary)">Failed website fetches</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">{failedWebsiteFetches ?? 0}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            {/* rate_limit_events only ever records an ALLOWED action (see
                check_and_record_rate_limit, migration 0008) — a blocked
                attempt never gets a row at all, so this is total
                throttle-tracked volume, not a count of blocks. Labeled
                accordingly rather than implying we track denials we don't. */}
            <p className="text-xs text-(--color-text-secondary)">Throttle-tracked actions (last hour)</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">{rateLimitEventsLastHour ?? 0}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            {/* Migration 0009 — the same in-flight count
                try_lock_audit_processing checks atomically before
                admitting a new audit. Previously nothing capped or even
                displayed this. */}
            <p className="text-xs text-(--color-text-secondary)">Currently processing (capacity)</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">
              {currentlyProcessing} / {MAX_CONCURRENT_AUDITS}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-(--color-text-secondary)">Audits admitted over capacity (lifetime)</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">{admittedOverCapacityCount}</p>
            {admittedOverCapacityCount > 0 && (
              <p className="mt-1 text-xs text-(--color-text-secondary)">
                One is normal under a short traffic burst — a growing count means the instance needs more headroom.
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            {/* websiteFetcher.ts's isThinContent — a "fetched" page with
                almost nothing readable in it, most likely JS-rendered
                content this fetcher's plain-HTML parse can't read.
                Capped at the most recent 500 fetched rows; see
                loadSystemStats. */}
            <p className="text-xs text-(--color-text-secondary)">Website fetches that came back thin</p>
            <p className="mt-1 text-2xl font-semibold text-(--color-text)">
              {thinWebsiteCount} / {fetchedWebsiteCount}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI usage (last 24h)</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-(--color-text-secondary)">Audits</p>
              <p className="mt-1 text-xl font-semibold text-(--color-text)">{usage24h.audits}</p>
            </div>
            <div>
              <p className="text-xs text-(--color-text-secondary)">Input tokens</p>
              <p className="mt-1 text-xl font-semibold text-(--color-text)">{usage24h.inputTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-(--color-text-secondary)">Output tokens</p>
              <p className="mt-1 text-xl font-semibold text-(--color-text)">{usage24h.outputTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-(--color-text-secondary)">Estimated cost</p>
              <p className="mt-1 text-xl font-semibold text-(--color-text)">
                {costPricingConfigured ? `$${usage24h.estimatedCostUsd.toFixed(2)}` : "Not configured"}
              </p>
            </div>
          </div>
          {!costPricingConfigured && (
            <p className="mt-3 text-xs text-(--color-text-secondary)">
              Set OPENAI_INPUT_PRICE_PER_1M / OPENAI_OUTPUT_PRICE_PER_1M (from your OpenAI billing dashboard — never
              guessed here) to see an estimated dollar cost. Token counts above are real either way.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent AI pipeline failures</CardTitle>
        </CardHeader>
        <CardBody>
          {recentFailedAudits && recentFailedAudits.length > 0 ? (
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {recentFailedAudits.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 text-sm">
                  <span className="text-xs text-(--color-text-secondary)">{new Date(a.updated_at).toLocaleString()}</span>
                  <span className="text-(--color-text)">{a.processing_error ?? "Unknown error"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-(--color-text-secondary)">No recent failures.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
