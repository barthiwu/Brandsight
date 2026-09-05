import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BrandForm } from "@/components/brand/BrandForm";
import { createBrandAction } from "@/lib/actions/brands";

export const metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Create a brand profile</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardBody>
          <BrandForm action={createBrandAction} submitLabel="Create brand" />
        </CardBody>
      </Card>
    </div>
  );
}
