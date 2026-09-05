"use client";

import { useActionState } from "react";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tables } from "@/types/database";
import type { ActionState } from "@/lib/actions/brands";
import { SOCIAL_PLATFORM_OPTIONS } from "@/lib/questions/config";

const initialState: ActionState = {};

export function SocialProfilesSection({
  profiles,
  addAction,
  removeAction,
}: {
  profiles: Tables<"social_profiles">[];
  addAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  removeAction: (id: string) => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(addAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-text-secondary)">All optional — add the profiles you actively use.</p>
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {profiles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium capitalize text-(--color-text)">{p.platform}</p>
                <p className="truncate text-xs text-(--color-text-secondary)">{p.handle || p.profile_url}</p>
              </div>
              <form action={removeAction.bind(null, p.id)}>
                <button type="submit" className="text-xs font-medium text-(--color-danger) hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3" noValidate>
        <Select label="Platform" name="platform" options={SOCIAL_PLATFORM_OPTIONS} placeholder="Select" required />
        <Input label="Handle" name="handle" placeholder="@yourbrand" />
        <Input label="Profile URL" name="profile_url" type="url" placeholder="https://" />
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" isLoading={isPending}>
            Add social profile
          </Button>
        </div>
      </form>
    </div>
  );
}
