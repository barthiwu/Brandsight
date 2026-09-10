"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { submitSelfAuditLeadAction, type LeadActionState } from "@/lib/actions/leads";

const initialState: LeadActionState = {};

interface SelfAuditLeadCTAProps {
  auditId: string;
  defaultName: string;
  defaultEmail: string;
  defaultBusinessName: string;
  alreadySubmitted: boolean;
}

/**
 * BlitzSMA funnel opt-in on the account holder's own completed-audit
 * report — the counterpart to LeadCaptureForm (which only runs on the
 * public shared-report page, for third-party viewers). Prefilled from
 * the signed-in user's own account/brand so saying yes is one submit,
 * not re-typing a form they've already effectively filled out by using
 * the product.
 */
export function SelfAuditLeadCTA({ auditId, defaultName, defaultEmail, defaultBusinessName, alreadySubmitted }: SelfAuditLeadCTAProps) {
  const [state, formAction, isPending] = useActionState(submitSelfAuditLeadAction, initialState);

  if (alreadySubmitted || state.success) {
    return <Alert tone="success">Thanks — the BlitzSMA team will review your audit and reach out.</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="audit_id" value={auditId} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" defaultValue={defaultName} required />
        <Input label="Email" name="email" type="email" defaultValue={defaultEmail} required />
        <Input label="Phone (optional)" name="phone" type="tel" />
        <Input label="Business name (optional)" name="business_name" defaultValue={defaultBusinessName} />
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
