// Central audit question configuration (spec §30-37).
// The onboarding UI, autosave, and AI Stage 1 (Normalize) all read from
// this file instead of hard-coding page-specific logic, so questions can
// change without a destructive schema migration (answers live in the
// schemaless `audit_responses.answer` jsonb column, keyed by `question_key`).

export type QuestionType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "boolean"
  | "number"
  | "url"
  | "competitor_list"
  | "social_list";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionDefinition {
  question_key: string;
  section: "business" | "objectives" | "audience" | "marketing" | "competitors" | "digital";
  label: string;
  description?: string;
  type: QuestionType;
  required: boolean;
  options?: QuestionOption[];
  maxItems?: number;
  /** Included in Quick Audit's required set. Everything else is Deep-only or optional. */
  quickAudit: "required" | "optional" | "hidden";
}

export const OBJECTIVE_OPTIONS: QuestionOption[] = [
  { value: "brand_awareness", label: "Brand awareness" },
  { value: "more_leads", label: "More leads" },
  { value: "more_sales", label: "More sales" },
  { value: "customer_retention", label: "Customer retention" },
  { value: "product_launch", label: "Product launch" },
  { value: "market_expansion", label: "Market expansion" },
  { value: "other", label: "Other" },
];

export const SOCIAL_PLATFORM_OPTIONS: QuestionOption[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
];

export const CHANNEL_OPTIONS: QuestionOption[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS/WhatsApp" },
  { value: "paid_search", label: "Paid search" },
  { value: "paid_social", label: "Paid social" },
  { value: "seo", label: "SEO / organic search" },
  { value: "offline", label: "Offline / in-person" },
];

export const BUDGET_RANGE_OPTIONS: QuestionOption[] = [
  { value: "none", label: "No dedicated budget" },
  { value: "under_500", label: "Under $500/month" },
  { value: "500_2000", label: "$500 - $2,000/month" },
  { value: "2000_10000", label: "$2,000 - $10,000/month" },
  { value: "over_10000", label: "Over $10,000/month" },
  { value: "undisclosed", label: "Prefer not to say" },
];

export const TEAM_SIZE_OPTIONS: QuestionOption[] = [
  { value: "solo_founder", label: "Just me (the founder)" },
  { value: "one_person", label: "One dedicated marketing person" },
  { value: "small_team", label: "A small in-house team (2-5)" },
  { value: "agency", label: "An outside agency/freelancer" },
  { value: "none", label: "No one currently" },
];

export const AUDIT_QUESTIONS: QuestionDefinition[] = [
  // --- Business (§31) ---
  { question_key: "business_name", section: "business", label: "Business name", type: "text", required: true, quickAudit: "required" },
  { question_key: "industry", section: "business", label: "Industry", type: "text", required: true, quickAudit: "required" },
  { question_key: "country", section: "business", label: "Country", type: "text", required: true, quickAudit: "required" },
  { question_key: "business_description", section: "business", label: "Business description", description: "What does your business do, in a couple of sentences?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "primary_product_service", section: "business", label: "Primary product/service", type: "text", required: true, quickAudit: "required" },
  { question_key: "business_model", section: "business", label: "Business model", description: "e.g. B2B, B2C, marketplace, subscription", type: "text", required: true, quickAudit: "required" },
  { question_key: "city", section: "business", label: "City", type: "text", required: false, quickAudit: "optional" },
  { question_key: "website_url", section: "business", label: "Website", type: "url", required: false, quickAudit: "optional" },
  { question_key: "years_operating", section: "business", label: "Years operating", type: "number", required: false, quickAudit: "optional" },

  // --- Objectives (§32) ---
  { question_key: "primary_objective", section: "objectives", label: "What is your primary marketing goal?", type: "select", required: true, options: OBJECTIVE_OPTIONS, quickAudit: "required" },
  { question_key: "biggest_marketing_challenge", section: "objectives", label: "What is your biggest marketing challenge?", type: "textarea", required: true, quickAudit: "required" },

  // --- Audience (§33) ---
  { question_key: "ideal_customer", section: "audience", label: "Who is your ideal customer?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "customer_problem", section: "audience", label: "What problem do you solve?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "customer_reason_to_choose", section: "audience", label: "Why do customers choose you?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "differentiator", section: "audience", label: "What makes you different?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "age_range", section: "audience", label: "Customer age range", type: "text", required: false, quickAudit: "optional" },
  { question_key: "gender", section: "audience", label: "Customer gender skew", type: "text", required: false, quickAudit: "optional" },
  { question_key: "location", section: "audience", label: "Customer location", type: "text", required: false, quickAudit: "optional" },
  { question_key: "income_segment", section: "audience", label: "Customer income segment", type: "text", required: false, quickAudit: "optional" },
  { question_key: "customer_type", section: "audience", label: "Customer type", description: "e.g. individual consumers, small businesses, enterprises", type: "text", required: false, quickAudit: "optional" },

  // --- Marketing (§34) ---
  { question_key: "channels", section: "marketing", label: "Which channels do you use?", type: "multiselect", required: true, options: CHANNEL_OPTIONS, quickAudit: "required" },
  { question_key: "posting_frequency", section: "marketing", label: "How often do you publish?", type: "text", required: true, quickAudit: "required" },
  { question_key: "advertising_active", section: "marketing", label: "Do you currently advertise?", type: "boolean", required: true, quickAudit: "required" },
  { question_key: "marketing_team_size", section: "marketing", label: "Who handles your marketing?", type: "select", required: true, options: TEAM_SIZE_OPTIONS, quickAudit: "required" },
  { question_key: "content_creation_process", section: "marketing", label: "What type of content do you currently produce?", type: "textarea", required: true, quickAudit: "required" },
  { question_key: "marketing_budget_range", section: "marketing", label: "Marketing budget range", type: "select", required: false, options: BUDGET_RANGE_OPTIONS, quickAudit: "optional" },

  // --- Competitors (§35) — 0-5, never forced ---
  { question_key: "competitors", section: "competitors", label: "Competitors", description: "Add up to 5. Entirely optional.", type: "competitor_list", required: false, maxItems: 5, quickAudit: "optional" },

  // --- Digital (§36) — all optional ---
  { question_key: "digital_website_url", section: "digital", label: "Website", type: "url", required: false, quickAudit: "optional" },
  { question_key: "social_profiles", section: "digital", label: "Social profiles", type: "social_list", required: false, options: SOCIAL_PLATFORM_OPTIONS, quickAudit: "optional" },
];

export function questionsForSection(section: QuestionDefinition["section"]) {
  return AUDIT_QUESTIONS.filter((q) => q.section === section);
}

export function requiredQuestionKeys(): string[] {
  return AUDIT_QUESTIONS.filter((q) => q.required).map((q) => q.question_key);
}

export const AUDIT_SECTIONS: QuestionDefinition["section"][] = [
  "business",
  "objectives",
  "audience",
  "marketing",
  "competitors",
  "digital",
];

export function isSectionComplete(
  section: QuestionDefinition["section"],
  answers: Record<string, unknown>
): boolean {
  return questionsForSection(section)
    .filter((q) => q.required)
    .every((q) => {
      const v = answers[q.question_key];
      return v !== undefined && v !== null && v !== "";
    });
}
