"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthActionState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-6 shadow-sm sm:p-8">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success ? (
        <Alert tone="success">{state.success}</Alert>
      ) : (
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" isLoading={isPending} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </div>
  );
}
