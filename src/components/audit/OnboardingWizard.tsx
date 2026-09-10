"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import {
  AUDIT_SECTIONS,
  questionsForSection,
  isSectionComplete,
  type QuestionDefinition,
} from "@/lib/questions/config";
import { QuestionField } from "./QuestionField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Field";
import { CompetitorsSection } from "@/components/brand/CompetitorsSection";
import { SocialProfilesSection } from "@/components/brand/SocialProfilesSection";
import { AssetUploadField } from "./AssetUploadField";
import { saveAuditResponsesAction, submitAuditForProcessingAction, type ActionState } from "@/lib/actions/audits";
import { updateBrandWebsiteAction, addCompetitorAction, removeCompetitorAction, addSocialProfileAction, removeSocialProfileAction } from "@/lib/actions/brands";
import type { Tables } from "@/types/database";

const SECTION_TITLES: Record<QuestionDefinition["section"], string> = {
  business: "Your business",
  objectives: "Your goals",
  audience: "Your audience",
  marketing: "Your marketing today",
  competitors: "Competitors",
  digital: "Website & social",
};

const initialSubmitState: ActionState = {};

export function OnboardingWizard({
  auditId,
  brandId,
  auditType,
  initialAnswers,
  websiteUrl,
  competitors,
  socialProfiles,
}: {
  auditId: string;
  brandId: string;
  auditType: "quick" | "deep";
  initialAnswers: Record<string, unknown>;
  websiteUrl: string | null;
  competitors: Tables<"competitors">[];
  socialProfiles: Tables<"social_profiles">[];
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  // Keyed by question_key, NOT a single shared timer. A single shared
  // debounceRef (the original implementation) meant editing ANY field
  // cleared and replaced the pending save for whichever field was
  // previously scheduled — so filling several fields within the same 600ms
  // window (completely normal for anyone typing at a reasonable pace, and
  // near-guaranteed for the E2E test's scripted fills) silently dropped
  // every field's save except whichever one last happened to sit quiet for
  // 600ms. Found live: a real Quick Audit submission was rejected as
  // missing every required field, including ones definitely filled in,
  // because almost none of them ever actually reached the database.
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingFlushersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const [submitState, submitAction, isSubmitting] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires the (prevState) signature even though this action ignores it
    async (_prev: ActionState) => submitAuditForProcessingAction(auditId),
    initialSubmitState
  );

  const section = AUDIT_SECTIONS[stepIndex];
  const questions = useMemo(() => questionsForSection(section), [section]);

  function scheduleSave(section: QuestionDefinition["section"], key: string, value: unknown) {
    const timers = pendingTimersRef.current;
    const existingTimer = timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    setSaveState("saving");

    const doSave = async () => {
      timers.delete(key);
      pendingFlushersRef.current.delete(key);
      const result = await saveAuditResponsesAction({
        audit_id: auditId,
        responses: [{ section, question_key: key, answer: value }],
      });
      setSaveState(result.ok ? "saved" : "error");
    };

    pendingFlushersRef.current.set(key, doSave);
    timers.set(
      key,
      setTimeout(() => {
        startTransition(() => {
          doSave();
        });
      }, 600)
    );
  }

  // Called before advancing/going back/submitting so a field edited just
  // before that click doesn't lose its still-debouncing save to a
  // navigation race — per-field debouncing alone fixes cross-field
  // cancellation, but a save that simply hasn't fired yet by the time the
  // user moves on is still a real gap without this.
  async function flushPendingSaves() {
    const timers = pendingTimersRef.current;
    const flushers = pendingFlushersRef.current;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    const pending = Array.from(flushers.values());
    flushers.clear();
    await Promise.all(pending.map((flush) => flush()));
  }

  function handleChange(question: QuestionDefinition, value: unknown) {
    setAnswers((prev) => ({ ...prev, [question.question_key]: value }));
    scheduleSave(question.section, question.question_key, value);
  }

  const requiredMissing = !isSectionComplete(section, answers);
  const isLastStep = stepIndex === AUDIT_SECTIONS.length - 1;
  const allRequiredComplete = AUDIT_SECTIONS.every((s) => isSectionComplete(s, answers));

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2" aria-label="Onboarding steps">
        {AUDIT_SECTIONS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStepIndex(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                i === stepIndex
                  ? "bg-(--color-blue) text-white"
                  : isSectionComplete(s, answers)
                    ? "bg-green-50 text-green-800"
                    : "bg-(--color-border) text-(--color-text-secondary)"
              }`}
            >
              {i + 1}. {SECTION_TITLES[s]}
              {(s === "competitors" || s === "digital") && (
                <span className="ml-1 text-[10px] opacity-75">(optional)</span>
              )}
            </button>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="text-xs text-(--color-text-secondary)">
        {saveState === "saving" && "Saving…"}
        {saveState === "saved" && "Saved"}
        {saveState === "error" && <span className="text-(--color-danger)">Could not save — check your connection.</span>}
      </div>

      <div className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-(--color-text)">{SECTION_TITLES[section]}</h2>

        {section === "competitors" && (
          <CompetitorsSection
            competitors={competitors}
            addAction={addCompetitorAction.bind(null, brandId)}
            removeAction={removeCompetitorAction.bind(null, brandId)}
          />
        )}

        {section === "digital" && (
          <div className="flex flex-col gap-6">
            <WebsiteField brandId={brandId} initialUrl={websiteUrl} />
            <SocialProfilesSection
              profiles={socialProfiles}
              addAction={addSocialProfileAction.bind(null, brandId)}
              removeAction={removeSocialProfileAction.bind(null, brandId)}
            />
            {auditType === "deep" && (
              <>
                <Alert tone="info">
                  Deep audits fetch and analyze your website directly, and do the same for any competitor sites you
                  list below. Brand assets you upload here get real visual/document analysis, not just a mention in
                  the report. We do not connect to social media platforms in V1 — social profiles are recorded as
                  context only, and the report will say so plainly rather than guessing at engagement or content.
                </Alert>
                <AssetUploadField auditId={auditId} />
              </>
            )}
          </div>
        )}

        {section !== "competitors" && section !== "digital" && (
          <div className="flex flex-col gap-5">
            {questions.map((q) => (
              <QuestionField key={q.question_key} question={q} value={answers[q.question_key]} onChange={(v) => handleChange(q, v)} />
            ))}
          </div>
        )}
      </div>

      {submitState.error && <Alert tone="error">{submitState.error}</Alert>}

      <div className="flex items-center justify-between border-t border-(--color-border) pt-5">
        <Button
          type="button"
          variant="secondary"
          disabled={stepIndex === 0}
          onClick={async () => {
            await flushPendingSaves();
            setStepIndex((i) => i - 1);
          }}
        >
          Back
        </Button>

        {isLastStep ? (
          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!allRequiredComplete}
            onClick={async () => {
              // Flush before submitting: submitAuditForProcessingAction
              // re-validates from the database, so a field edited just
              // before this click must have actually reached it first —
              // see flushPendingSaves' own comment for why this matters.
              // submitAction (from useActionState) ignores its payload and
              // just calls submitAuditForProcessingAction(auditId), so
              // calling it directly here — instead of wiring it as a
              // <form action={submitAction}> — is equivalent and lets this
              // await the flush first.
              await flushPendingSaves();
              submitAction();
            }}
          >
            Submit for analysis
          </Button>
        ) : (
          <Button
            type="button"
            onClick={async () => {
              await flushPendingSaves();
              setStepIndex((i) => i + 1);
            }}
            disabled={requiredMissing && section !== "competitors" && section !== "digital"}
          >
            Next
          </Button>
        )}
      </div>
      {!allRequiredComplete && isLastStep && (
        <p className="text-right text-xs text-(--color-text-secondary)">
          Fill in the required fields in every step before submitting.
        </p>
      )}
    </div>
  );
}

function WebsiteField({ brandId, initialUrl }: { brandId: string; initialUrl: string | null }) {
  const [state, formAction, isPending] = useActionState(updateBrandWebsiteAction.bind(null, brandId), {} as ActionState);
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3" noValidate>
      <div className="flex-1">
        <Input label="Website" name="website_url" type="url" placeholder="https://" defaultValue={initialUrl ?? ""} />
      </div>
      <Button type="submit" variant="secondary" isLoading={isPending}>
        Save website
      </Button>
      {state.error && <span className="text-xs text-(--color-danger)">{state.error}</span>}
    </form>
  );
}
