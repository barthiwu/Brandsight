import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export const metadata = { title: "Admin — System" };
export const dynamic = "force-dynamic";

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

  const [
    { count: failedAudits },
    { data: recentFailedAudits },
    { count: failedWebsiteFetches },
    { count: rateLimitEventsLastHour },
  ] = await Promise.all([
    supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("audits").select("id, processing_error, updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(10),
    supabase.from("website_sources").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("rate_limit_events").select("*", { count: "exact", head: true }).gte("created_at", oneHourAgo),
  ]);

  return { failedAudits, recentFailedAudits, failedWebsiteFetches, rateLimitEventsLastHour };
}

export default async function AdminSystemPage() {
  const { failedAudits, recentFailedAudits, failedWebsiteFetches, rateLimitEventsLastHour } = await loadSystemStats();

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
