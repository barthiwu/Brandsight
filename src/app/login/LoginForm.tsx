"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, signInWithGoogleAction, type AuthActionState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const initialState: AuthActionState = {};

export function LoginForm({ redirectTo, googleUnavailable }: { redirectTo?: string; googleUnavailable?: boolean }) {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-border) bg-white p-6 shadow-sm sm:p-8">
      {googleUnavailable && (
        <Alert tone="warning">Google sign-in isn&apos;t available right now. Please use email and password.</Alert>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={signInWithGoogleAction}>
        <Button type="submit" variant="secondary" className="w-full">
          Continue with Google
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-(--color-text-secondary)">
        <div className="h-px flex-1 bg-(--color-border)" />
        or
        <div className="h-px flex-1 bg-(--color-border)" />
      </div>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input label="Password" name="password" type="password" autoComplete="current-password" required />
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-(--color-blue) hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={isPending} className="w-full">
          Log in
        </Button>
      </form>
    </div>
  );
}
