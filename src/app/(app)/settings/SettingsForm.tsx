"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { updateProfileAction, type ActionState } from "@/lib/actions/settings";

const initialState: ActionState = {};

export function SettingsForm({ email, fullName }: { email: string; fullName: string }) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <Input label="Email" name="email" value={email} disabled readOnly />
      <Input label="Full name" name="fullName" defaultValue={fullName} required />
      <div>
        <Button type="submit" isLoading={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
