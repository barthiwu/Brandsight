"use client";

import { useActionState } from "react";
import { Input, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tables } from "@/types/database";
import type { ActionState } from "@/lib/actions/brands";

const initialState: ActionState = {};

export function BrandForm({
  action,
  brand,
  submitLabel = "Save",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  brand?: Tables<"brands">;
  submitLabel?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <Input label="Business name" name="name" defaultValue={brand?.name} required />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input label="Industry" name="industry" defaultValue={brand?.industry ?? ""} required />
        <Input label="Country" name="country" defaultValue={brand?.country ?? ""} required />
      </div>
      <Textarea
        label="Business description"
        name="description"
        defaultValue={brand?.description ?? ""}
        description="What does your business do, in a couple of sentences?"
        required
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input
          label="Primary product/service"
          name="primary_product_service"
          defaultValue={brand?.primary_product_service ?? ""}
          required
        />
        <Input
          label="Business model"
          name="business_model"
          defaultValue={brand?.business_model ?? ""}
          description="e.g. B2B, B2C, marketplace, subscription"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Input label="City" name="city" defaultValue={brand?.city ?? ""} />
        <Input label="Website" name="website_url" type="url" placeholder="https://" defaultValue={brand?.website_url ?? ""} />
        <Input
          label="Years operating"
          name="years_operating"
          type="number"
          min={0}
          defaultValue={brand?.years_operating ?? undefined}
        />
      </div>

      <div>
        <Button type="submit" isLoading={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
