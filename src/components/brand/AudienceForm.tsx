"use client";

import { useActionState } from "react";
import { Input, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tables } from "@/types/database";
import type { ActionState } from "@/lib/actions/brands";

const initialState: ActionState = {};

export function AudienceForm({
  action,
  audience,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  audience?: Tables<"brand_audience">;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <Textarea label="Who is your ideal customer?" name="ideal_customer" defaultValue={audience?.ideal_customer ?? ""} required />
      <Textarea label="What problem do you solve?" name="customer_problem" defaultValue={audience?.customer_problem ?? ""} required />
      <Textarea
        label="Why do customers choose you?"
        name="customer_reason_to_choose"
        defaultValue={audience?.customer_reason_to_choose ?? ""}
        required
      />
      <Textarea label="What makes you different?" name="differentiator" defaultValue={audience?.differentiator ?? ""} required />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Age range" name="age_range" defaultValue={audience?.age_range ?? ""} />
        <Input label="Gender skew" name="gender" defaultValue={audience?.gender ?? ""} />
        <Input label="Location" name="location" defaultValue={audience?.location ?? ""} />
        <Input label="Income segment" name="income_segment" defaultValue={audience?.income_segment ?? ""} />
      </div>
      <Input label="Customer type" name="customer_type" defaultValue={audience?.customer_type ?? ""} />
      <div>
        <Button type="submit" isLoading={isPending}>
          Save audience
        </Button>
      </div>
    </form>
  );
}
