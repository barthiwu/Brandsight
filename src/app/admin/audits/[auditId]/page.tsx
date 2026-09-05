import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DIMENSION_LABELS } from "@/lib/scoring/dimensions";

export const metadata = { title: "Admin — Audit detail" };
export const dynamic = "force-dynamic";

interface AdminAuditDetailProps {
  params: Promise<{ auditId: string }>;
}

export default async function AdminAuditDetailPage({ params }: AdminAuditDetailProps) {
  const { auditId } = await params;
  const supabase = createAdminClient();

  const [{ data: audit }, { data: dimensions }] = await Promise.all([
    supabase.from("audits").select("*, brands(name, owner_id)").eq("id", auditId).maybeSingle(),
    supabase.from("audit_dimensions").select("*").eq("audit_id", auditId),
  ]);

  if (!audit) notFound();
  const brand = (audit as unknown as { brands: { name: string; owner_id: string } | null }).brands;
  let ownerEmail: string | null = null;
  if (brand?.owner_id) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", brand.owner_id).maybeSingle();
    ownerEmail = profile?.email ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">{brand?.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Field label="Owner" value={ownerEmail ?? "—"} />
          <Field label="Type" value={audit.audit_type} />
          <Field label="Status" value={audit.status} />
          <Field label="Score" value={audit.overall_score != null ? `${audit.overall_score}/100` : "—"} />
          <Field label="Confidence" value={audit.overall_confidence ?? "—"} />
          <Field label="Created" value={new Date(audit.created_at).toLocaleString()} />
          <Field label="Completed" value={audit.completed_at ? new Date(audit.completed_at).toLocaleString() : "—"} />
        </CardBody>
      </Card>

      {audit.processing_error && (
        <Card>
          <CardHeader>
            <CardTitle>Processing error</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-(--color-danger)">{audit.processing_error}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dimension scores</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-col divide-y divide-(--color-border)">
            {(dimensions ?? []).map((d) => (
              <li key={d.dimension_key} className="flex justify-between py-2 text-sm">
                <span>{DIMENSION_LABELS[d.dimension_key]}</span>
                <span>
                  {d.score ?? "N/A"} ({d.confidence})
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-(--color-text-secondary)">{label}</p>
      <p className="font-medium capitalize text-(--color-text)">{value}</p>
    </div>
  );
}
