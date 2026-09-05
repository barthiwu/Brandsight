import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";
import type { AuditStatus, AuditType } from "@/types/database";

export const metadata = { title: "Admin — Audits" };
export const dynamic = "force-dynamic";

interface AdminAuditsPageProps {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}

const AUDIT_STATUSES = ["draft", "ready", "processing", "completed", "failed", "cancelled"] as const;
const AUDIT_TYPES = ["quick", "deep"] as const;

function asAuditStatus(value: string | undefined): AuditStatus | undefined {
  return AUDIT_STATUSES.includes(value as AuditStatus) ? (value as AuditStatus) : undefined;
}

function asAuditType(value: string | undefined): AuditType | undefined {
  return AUDIT_TYPES.includes(value as AuditType) ? (value as AuditType) : undefined;
}

export default async function AdminAuditsPage({ searchParams }: AdminAuditsPageProps) {
  const { q, status: rawStatus, type: rawType } = await searchParams;
  const status = asAuditStatus(rawStatus);
  const type = asAuditType(rawType);
  const supabase = createAdminClient();

  let query = supabase
    .from("audits")
    .select("id, audit_type, status, overall_score, created_at, brands(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("audit_type", type);

  const { data: audits } = await query;
  const filtered = q
    ? (audits ?? []).filter((a) =>
        (a as unknown as { brands: { name: string } | null }).brands?.name?.toLowerCase().includes(q.toLowerCase())
      )
    : audits ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Audits</h1>

      <form className="flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by brand name"
          className="rounded-lg border border-(--color-border) px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-(--color-border) px-3 py-2 text-sm">
          <option value="">Any status</option>
          {["draft", "ready", "processing", "completed", "failed", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ""} className="rounded-lg border border-(--color-border) px-3 py-2 text-sm">
          <option value="">Any type</option>
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
        <button type="submit" className="rounded-lg bg-(--color-blue) px-4 py-2 text-sm font-medium text-white">
          Filter
        </button>
      </form>

      {filtered.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-(--color-border) text-xs uppercase text-(--color-text-secondary)">
              <tr>
                <th className="p-3">Brand</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Score</th>
                <th className="p-3">Created</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-(--color-border) last:border-0">
                  <td className="p-3">{(a as unknown as { brands: { name: string } | null }).brands?.name ?? "—"}</td>
                  <td className="p-3 capitalize">{a.audit_type}</td>
                  <td className="p-3 capitalize">{a.status}</td>
                  <td className="p-3">{a.overall_score ?? "—"}</td>
                  <td className="p-3">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <Link href={`/admin/audits/${a.id}`} className="font-medium text-(--color-blue) hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="No audits match these filters" />
      )}
    </div>
  );
}
