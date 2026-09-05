"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tables } from "@/types/database";
import type { ActionState } from "@/lib/actions/brands";

const initialState: ActionState = {};

export function CompetitorsSection({
  competitors,
  addAction,
  removeAction,
}: {
  competitors: Tables<"competitors">[];
  addAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  removeAction: (id: string) => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(addAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-text-secondary)">
        Optional — add up to 5. BrandSight never forces competitor information.
      </p>
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {competitors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {competitors.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-(--color-text)">{c.name}</p>
                {c.url && <p className="truncate text-xs text-(--color-text-secondary)">{c.url}</p>}
              </div>
              <form action={removeAction.bind(null, c.id)}>
                <button type="submit" className="text-xs font-medium text-(--color-danger) hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {competitors.length < 5 && (
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
          <Input label="Competitor name" name="name" required />
          <Input label="Website (optional)" name="url" type="url" placeholder="https://" />
          <Input label="Social handle (optional)" name="social_handle" />
          <Input label="Notes (optional)" name="notes" />
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" isLoading={isPending}>
              Add competitor
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
