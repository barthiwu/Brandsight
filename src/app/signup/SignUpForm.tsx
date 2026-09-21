"use client";

import Script from "next/script";
import { useActionState } from "react";
import { signUpAction, signInWithGoogleAction, type AuthActionState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const initialState: AuthActionState = {};

/**
 * `turnstileSiteKey` is only passed once TURNSTILE_SECRET_KEY /
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY are actually configured (see
 * src/lib/security/turnstile.ts) — undefined today, everywhere, so the
 * widget script and div below don't render at all and this form behaves
 * exactly as it did before. Once configured, the widget's own script
 * injects a hidden `cf-turnstile-response` input inside the div below —
 * since that div is inside the <form>, the token rides along with the
 * normal form submission with no extra client state needed here.
 */
export function SignUpForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  if (state.success) {
    return <Alert tone="success">{state.success}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-6 shadow-sm sm:p-8">
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
        <Input label="Full name" name="fullName" type="text" autoComplete="name" required />
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          description="At least 8 characters."
          required
        />
        {turnstileSiteKey && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="auto" />
          </>
        )}
        <Button type="submit" isLoading={isPending} className="w-full">
          Create free account
        </Button>
      </form>
      <p className="text-xs text-(--color-text-secondary)">
        By signing up you agree to receive account-related emails from BrandSight.
      </p>
    </div>
  );
}
