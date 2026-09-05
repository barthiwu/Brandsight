import { AUDIT_QUESTIONS, type QuestionDefinition } from "./config";

/**
 * Server-side audit-readiness validation (hardening pass §5, §27).
 *
 * The onboarding wizard already gates its own "Next"/"Submit" buttons on
 * `isSectionComplete()`, but that's client-side UX only — a request
 * straight at `submitAuditForProcessingAction` (or a client that skips
 * the wizard) must not be able to flip an audit to "ready" with missing,
 * malformed, or bogus answers. This re-validates the same required-
 * question set server-side, PLUS format-checks every answered value
 * (not just the required ones) so a malformed value can't ride along
 * into the AI pipeline or a downstream fetch (e.g. a bad URL).
 *
 * Deliberately has no "server-only" import: this module is pure logic
 * with no secrets and no I/O, so it can be unit tested directly and
 * imported from either side if ever needed. It is only ever called from
 * server actions today (see src/lib/actions/audits.ts).
 */

const MAX_TEXT_LENGTH = 4000; // guards against pathological input reaching the AI pipeline (spec §43)
const MAX_SHORT_TEXT_LENGTH = 300;

export interface ValidationIssue {
  question_key: string;
  message: string;
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validates one answer against its question definition's type. Returns an error message, or null if valid. */
function validateAnswerShape(question: QuestionDefinition, value: unknown): string | null {
  if (!isNonEmpty(value)) return null; // presence (required-ness) is checked separately

  switch (question.type) {
    case "text":
      if (typeof value !== "string") return `${question.label} must be text.`;
      if (value.length > MAX_SHORT_TEXT_LENGTH) return `${question.label} is too long.`;
      return null;
    case "textarea":
      if (typeof value !== "string") return `${question.label} must be text.`;
      if (value.length > MAX_TEXT_LENGTH) return `${question.label} is too long.`;
      return null;
    case "select": {
      if (typeof value !== "string") return `${question.label} has an invalid value.`;
      const allowed = new Set((question.options ?? []).map((o) => o.value));
      return allowed.has(value) ? null : `${question.label} has an invalid selection.`;
    }
    case "multiselect": {
      if (!Array.isArray(value)) return `${question.label} has an invalid value.`;
      const allowed = new Set((question.options ?? []).map((o) => o.value));
      return value.every((v) => typeof v === "string" && allowed.has(v))
        ? null
        : `${question.label} has an invalid selection.`;
    }
    case "boolean":
      return typeof value === "boolean" ? null : `${question.label} must be yes or no.`;
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 200
        ? null
        : `${question.label} must be a valid number.`;
    case "url":
      return typeof value === "string" && isValidHttpUrl(value)
        ? null
        : `${question.label} must be a valid http(s) URL.`;
    case "competitor_list":
    case "social_list":
      return Array.isArray(value) ? null : `${question.label} has an invalid value.`;
    default:
      return null;
  }
}

/**
 * Validates every response in `answers` for the given audit type. Checks:
 *  1. Every question required for this audit type has a non-empty answer.
 *  2. Every answered value (required or not) matches its question's expected shape.
 *
 * Returns an empty array when the audit is ready to submit.
 */
export function validateAuditReadiness(
  auditType: "quick" | "deep",
  answers: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const question of AUDIT_QUESTIONS) {
    // Only "business", "objectives", "audience", "marketing" questions are
    // collected through audit_responses — "competitors" and "digital" are
    // managed via the brand-scoped tables directly (see OnboardingWizard)
    // and are never required at this layer.
    if (question.section === "competitors" || question.section === "digital") continue;

    const value = answers[question.question_key];
    const isRequiredForThisType = question.quickAudit === "required" || (auditType === "deep" && question.required);

    if (isRequiredForThisType && !isNonEmpty(value)) {
      issues.push({ question_key: question.question_key, message: `${question.label} is required.` });
      continue;
    }

    const shapeError = validateAnswerShape(question, value);
    if (shapeError) {
      issues.push({ question_key: question.question_key, message: shapeError });
    }
  }

  return issues;
}
