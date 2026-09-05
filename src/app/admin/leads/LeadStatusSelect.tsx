"use client";

import { updateLeadStatusAction } from "@/lib/actions/adminLeads";

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  return (
    <form action={updateLeadStatusAction} className="flex items-center gap-2">
      <input type="hidden" name="lead_id" value={leadId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-(--color-border) px-2 py-1 text-xs capitalize"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
