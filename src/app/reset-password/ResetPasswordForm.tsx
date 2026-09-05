"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthActionState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const initialState: AuthActionState = {};

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-border) bg-white p-6 shadow-sm sm:p-8">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          description="At least 8 characters."
          required
        />
        <Button type="submit" isLoading={isPending} className="w-full">
          Set new password
        </Button>
      </form>
    </div>
  );
}
