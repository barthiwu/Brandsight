import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";

export const metadata = { title: "Admin — Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = createAdminClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);

  const brandCounts = new Map<string, number>();
  const auditCounts = new Map<string, number>();
  if (profiles && profiles.length > 0) {
    const ids = profiles.map((p) => p.id);
    const [{ data: brands }, { data: audits }] = await Promise.all([
      supabase.from("brands").select("owner_id").in("owner_id", ids),
      supabase.from("audits").select("owner_id").in("owner_id", ids),
    ]);
    for (const b of brands ?? []) brandCounts.set(b.owner_id, (brandCounts.get(b.owner_id) ?? 0) + 1);
    for (const a of audits ?? []) auditCounts.set(a.owner_id, (auditCounts.get(a.owner_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Users</h1>

      {profiles && profiles.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-(--color-border) text-xs uppercase text-(--color-text-secondary)">
              <tr>
                <th className="p-3">Email</th>
                <th className="p-3">Name</th>
                <th className="p-3">Brands</th>
                <th className="p-3">Audits</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-(--color-border) last:border-0">
                  <td className="p-3">{p.email}</td>
                  <td className="p-3">{p.full_name ?? "—"}</td>
                  <td className="p-3">{brandCounts.get(p.id) ?? 0}</td>
                  <td className="p-3">{auditCounts.get(p.id) ?? 0}</td>
                  <td className="p-3">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="No users yet" />
      )}
    </div>
  );
}
