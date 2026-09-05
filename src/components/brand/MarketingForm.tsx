"use client";

import { useActionState } from "react";
import { Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tables } from "@/types/database";
import type { ActionState } from "@/lib/actions/brands";
import { CHANNEL_OPTIONS, BUDGET_RANGE_OPTIONS, TEAM_SIZE_OPTIONS } from "@/lib/questions/config";

const initialState: ActionState = {};

export function MarketingForm({
  action,
  profile,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  profile?: Tables<"marketing_profiles">;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-(--color-text)">Which channels do you use?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CHANNEL_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-(--color-text)">
              <input
                type="checkbox"
                name="channels"
                value={opt.value}
                defaultChecked={profile?.channels?.includes(opt.value)}
                className="h-4 w-4 rounded border-(--color-border)"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Select
        label="Who handles your marketing?"
        name="marketing_team_size"
        options={TEAM_SIZE_OPTIONS}
        defaultValue={profile?.marketing_team_size ?? ""}
        placeholder="Select one"
        required
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-(--color-text)">Do you currently advertise?</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="advertising_active" value="true" defaultChecked={profile?.advertising_active === true} />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="advertising_active" value="false" defaultChecked={profile?.advertising_active !== true} />
            No
          </label>
        </div>
      </div>

      <Select
        label="How often do you publish?"
        name="posting_frequency"
        placeholder="Select one"
        defaultValue={profile?.posting_frequency ?? ""}
        options={[
          { value: "daily", label: "Daily" },
          { value: "few_times_week", label: "A few times a week" },
          { value: "weekly", label: "Weekly" },
          { value: "few_times_month", label: "A few times a month" },
          { value: "rarely", label: "Rarely" },
          { value: "never", label: "Never" },
        ]}
        required
      />

      <Textarea
        label="What type of content do you currently produce?"
        name="content_creation_process"
        defaultValue={profile?.content_creation_process ?? ""}
        required
      />

      <Select
        label="Marketing budget range"
        name="marketing_budget_range"
        options={BUDGET_RANGE_OPTIONS}
        defaultValue={profile?.marketing_budget_range ?? ""}
        placeholder="Prefer not to answer"
      />

      <div>
        <Button type="submit" isLoading={isPending}>
          Save marketing profile
        </Button>
      </div>
    </form>
  );
}
