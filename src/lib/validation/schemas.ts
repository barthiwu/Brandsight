import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(320),
  password: z.string().min(1, "Password is required").max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(320),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// ---------------------------------------------------------------------------
// Brands (spec §13-18)
// ---------------------------------------------------------------------------
export const brandSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  website_url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), "Enter a full URL starting with http(s)://")
    .optional()
    .or(z.literal("")),
  business_model: z.string().trim().max(200).optional().or(z.literal("")),
  primary_product_service: z.string().trim().max(300).optional().or(z.literal("")),
  years_operating: z.coerce.number().int().min(0).max(200).optional().nullable(),
});

export const brandAudienceSchema = z.object({
  ideal_customer: z.string().trim().max(2000).optional().or(z.literal("")),
  customer_problem: z.string().trim().max(2000).optional().or(z.literal("")),
  customer_reason_to_choose: z.string().trim().max(2000).optional().or(z.literal("")),
  differentiator: z.string().trim().max(2000).optional().or(z.literal("")),
  market_segment: z.string().trim().max(300).optional().or(z.literal("")),
  age_range: z.string().trim().max(100).optional().or(z.literal("")),
  gender: z.string().trim().max(100).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  income_segment: z.string().trim().max(150).optional().or(z.literal("")),
  customer_type: z.string().trim().max(200).optional().or(z.literal("")),
});

export const competitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\/.+/i.test(v), "Enter a full URL starting with http(s)://")
    .optional()
    .or(z.literal("")),
  social_handle: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const competitorListSchema = z.array(competitorSchema).max(5, "Add up to 5 competitors");

export const socialProfileSchema = z.object({
  platform: z.enum(["instagram", "facebook", "tiktok", "linkedin", "x", "youtube", "other"]),
  profile_url: z.string().trim().max(500).optional().or(z.literal("")),
  handle: z.string().trim().max(120).optional().or(z.literal("")),
});

export const socialProfileListSchema = z.array(socialProfileSchema).max(10);

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------
export const createAuditSchema = z.object({
  brand_id: z.string().uuid(),
  audit_type: z.enum(["quick", "deep"]),
});

export const auditResponseSchema = z.object({
  audit_id: z.string().uuid(),
  section: z.enum(["business", "objectives", "audience", "marketing", "competitors", "digital"]),
  question_key: z.string().min(1).max(100),
  // Answers are intentionally loosely typed at the transport layer (any
  // JSON-serializable value); question-specific shape is enforced by the
  // per-question schemas above where it matters (competitors, socials).
  answer: z.unknown(),
});

export const autosaveBatchSchema = z.object({
  audit_id: z.string().uuid(),
  responses: z
    .array(
      z.object({
        section: z.enum(["business", "objectives", "audience", "marketing", "competitors", "digital"]),
        question_key: z.string().min(1).max(100),
        answer: z.unknown(),
      })
    )
    .min(1)
    .max(50),
});

// ---------------------------------------------------------------------------
// Leads (spec §68-69)
// ---------------------------------------------------------------------------
export const leadCaptureSchema = z.object({
  audit_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email").max(320),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  business_name: z.string().trim().max(200).optional().or(z.literal("")),
  consent_marketing: z.boolean().refine((v) => v === true || v === false, {
    message: "Consent must be explicit",
  }),
});

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------
export const shareSettingsSchema = z.object({
  audit_id: z.string().uuid(),
  is_active: z.boolean(),
});

// ---------------------------------------------------------------------------
// Asset uploads (spec §56)
// ---------------------------------------------------------------------------
export const ALLOWED_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_ASSET_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const assetUploadMetaSchema = z.object({
  audit_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_ASSET_MIME_TYPES),
  file_size: z
    .number()
    .int()
    .positive()
    .max(MAX_ASSET_FILE_SIZE_BYTES, "File must be 10MB or smaller"),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const leadStatusUpdateSchema = z.object({
  lead_id: z.string().uuid(),
  status: z.enum(["new", "contacted", "qualified", "converted", "closed"]),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type BrandInput = z.infer<typeof brandSchema>;
export type LeadCaptureInput = z.infer<typeof leadCaptureSchema>;
