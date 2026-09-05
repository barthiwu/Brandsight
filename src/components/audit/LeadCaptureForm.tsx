"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { submitLeadAction, type LeadActionState } from "@/lib/actions/leads";

const initialState: LeadActionState = {};

export function LeadCaptureForm({ shareToken }: { shareToken: string }) {
  const [state, formAction, isPending] = useActionState(submitLeadAction, initialState);

  if (state.success) {
    return <Alert tone="success">Thanks — we&apos;ll be in touch soon.</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="share_token" value={shareToken} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" required />
        <Input label="Email" name="email" type="email" required />
        <Input label="Phone (optional)" name="phone" type="tel" />
        <Input label="Business name (optional)" name="business_name" />
      </div>
      <label className="flex items-start gap-2 text-sm text-(--color-text)">
        <input type="checkbox" name="consent_marketing" className="mt-0.5 h-4 w-4 rounded border-(--color-border)" />
        <span>I agree to be contacted by Blitz SMA about marketing services and related opportunities.</span>
      </label>
      <div>
        <Button type="submit" isLoading={isPending}>
          Talk to Blitz SMA
        </Button>
      </div>
    </form>
  );
}
