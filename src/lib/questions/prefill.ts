import { AUDIT_QUESTIONS } from "./config";
import type { Tables } from "@/types/database";

export type BrandPrefillSource = Pick<
  Tables<"brands">,
  "name" | "industry" | "country" | "description" | "primary_product_service" | "business_model" | "city" | "years_operating"
>;

/**
 * Merges saved `audit_responses` answers with brand-profile prefill
 * defaults for the business-section fields that mirror data already on
 * the brand record.
 *
 * Used by BOTH the onboarding wizard (so a returning user sees their
 * brand's existing profile pre-filled) and server-side submission
 * validation (`submitAuditForProcessingAction`) — these two call sites
 * MUST stay in sync. A wizard that considers a section "complete" using
 * prefilled data that submission then can't see is exactly the bug this
 * shared helper exists to prevent: found live, every business-section
 * field — including the untouched, already-prefilled Business name — was
 * rejected as "required" on submit even though the wizard had already
 * accepted that same prefilled value as complete. That happened because
 * a prefilled-but-never-re-edited field is never written to
 * `audit_responses` (nothing calls the autosave action for a field the
 * user never touched), while `submitAuditForProcessingAction` used to
 * validate against `audit_responses` alone. Previously this merge logic
 * was duplicated inline in the wizard's page component and had no
 * server-side equivalent at all; centralizing it here is what makes that
 * class of drift impossible going forward.
 */
export function buildAnswersWithBrandPrefill(
  brand: BrandPrefillSource | null | undefined,
  savedAnswers: Record<string, unknown>
): Record<string, unknown> {
  const prefill: Record<string, unknown> = {
    business_name: brand?.name,
    industry: brand?.industry,
    country: brand?.country,
    business_description: brand?.description,
    primary_product_service: brand?.primary_product_service,
    business_model: brand?.business_model,
    city: brand?.city,
    years_operating: brand?.years_operating,
  };

  return Object.fromEntries(
    AUDIT_QUESTIONS.map((q) => [q.question_key, savedAnswers[q.question_key] ?? prefill[q.question_key] ?? null])
  );
}
