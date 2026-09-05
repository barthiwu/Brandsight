import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Alert";

export const metadata = { title: "Brands" };
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, industry, website_url, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-(--color-text)">Brands</h1>
        <Link href="/brands/new">
          <Button>New brand</Button>
        </Link>
      </div>

      {brands && brands.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <Link key={brand.id} href={`/brands/${brand.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardBody>
                  <p className="font-semibold text-(--color-text)">{brand.name}</p>
                  <p className="mt-1 text-sm text-(--color-text-secondary)">{brand.industry || "No industry set"}</p>
                  {brand.website_url && (
                    <p className="mt-2 truncate text-xs text-(--color-blue)">{brand.website_url}</p>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No brands yet"
          description="Create a brand profile to start running marketing audits for it."
          action={
            <Link href="/brands/new">
              <Button>Create your first brand</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
