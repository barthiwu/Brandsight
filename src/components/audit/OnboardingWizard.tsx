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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitState, submitAction, isSubmitting] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires the (prevState) signature even though this action ignores it
    async (_prev: ActionState) => submitAuditForProcessingAction(auditId),
    initialSubmitState
  );

  const section = AUDIT_SECTIONS[stepIndex];
  const questions = useMemo(() => questionsForSection(section), [section]);

  function scheduleSave(section: QuestionDefinition["section"], key: string, value: unknown) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("saving");
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await saveAuditResponsesAction({
          audit_id: auditId,
          responses: [{ section, question_key: key, answer: value }],
        });
        setSaveState(result.ok ? "saved" : "error");
      });
    }, 600);
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
                    : "bg-slate-100 text-(--color-text-secondary)"
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
                  Deep audits analyze whatever website and public social evidence is accessible. If a profile can&apos;t
                  be assessed, the report will say so rather than guessing.
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
        <Button type="button" variant="secondary" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
          Back
        </Button>

        {isLastStep ? (
          <form action={submitAction}>
            <Button type="submit" isLoading={isSubmitting} disabled={!allRequiredComplete}>
              Submit for analysis
            </Button>
          </form>
        ) : (
          <Button type="button" onClick={() => setStepIndex((i) => i + 1)} disabled={requiredMissing && section !== "competitors" && section !== "digital"}>
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
