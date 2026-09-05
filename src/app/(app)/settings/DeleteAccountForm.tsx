"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { deleteAccountAction, type ActionState } from "@/lib/actions/settings";

const initialState: ActionState = {};

export function DeleteAccountForm() {
  const [state, formAction, isPending] = useActionState(deleteAccountAction, initialState);
  const [confirmation, setConfirmation] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Alert tone="warning">
        This permanently deletes your account, every brand and audit you&apos;ve created, all uploaded files, and any
        shared report links — immediately and without a recovery option.
      </Alert>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Input
        label='Type "DELETE" to confirm'
        name="confirmation"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        autoComplete="off"
      />
      <div>
        <Button type="submit" variant="danger" isLoading={isPending} disabled={confirmation !== "DELETE"}>
          Permanently delete my account
        </Button>
      </div>
    </form>
  );
}
