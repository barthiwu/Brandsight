"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { createAuditAction, type ActionState } from "@/lib/actions/audits";

const initialState: ActionState = {};

export function NewAuditForm({
  brands,
  defaultBrandId,
}: {
  brands: { id: string; name: string }[];
  defaultBrandId?: string;
}) {
  const [state, formAction, isPending] = useActionState(createAuditAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Select
        label="Brand"
        name="brand_id"
        required
        defaultValue={defaultBrandId ?? ""}
        placeholder="Select a brand"
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-(--color-text)">Audit depth</legend>
        <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-(--color-border) p-4 hover:bg-(--color-bg) has-[:checked]:border-(--color-blue) has-[:checked]:bg-blue-50/40">
          <span className="flex items-center gap-2 font-medium text-(--color-text)">
            <input type="radio" name="audit_type" value="quick" defaultChecked required />
            Quick Audit
          </span>
          <span className="text-sm text-(--color-text-secondary)">
            A few minutes. Based on the information you provide about your business, audience, and marketing.
          </span>
        </label>
        <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-(--color-border) p-4 hover:bg-(--color-bg) has-[:checked]:border-(--color-blue) has-[:checked]:bg-blue-50/40">
          <span className="flex items-center gap-2 font-medium text-(--color-text)">
            <input type="radio" name="audit_type" value="deep" />
            Deep Audit
          </span>
          <span className="text-sm text-(--color-text-secondary)">
            Everything in Quick, plus a real look at your website, your competitors&apos; websites (if you list any),
            and any brand assets you upload — visited/analyzed directly, not guessed at. We don&apos;t connect to
            social media accounts in either audit type, so social profiles are recorded as context, not analyzed.
          </span>
        </label>
      </fieldset>

      <Button type="submit" isLoading={isPending}>
        Continue
      </Button>
    </form>
  );
}
