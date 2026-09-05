import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { NewAuditForm } from "./NewAuditForm";

export const metadata = { title: "New audit" };
export const dynamic = "force-dynamic";

interface NewAuditPageProps {
  searchParams: Promise<{ brandId?: string }>;
}

export default async function NewAuditPage({ searchParams }: NewAuditPageProps) {
  const { brandId } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name").order("created_at", { ascending: false });

  if (!brands || brands.length === 0) {
    return (
      <EmptyState
        title="Create a brand first"
        description="BrandSight audits a specific brand profile. Add one to get started."
        action={
          <Link href="/brands/new">
            <Button>Create a brand</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Start a free audit</h1>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Choose a brand and audit depth</CardTitle>
        </CardHeader>
        <CardBody>
          <NewAuditForm brands={brands} defaultBrandId={brandId} />
        </CardBody>
      </Card>
    </div>
  );
}
