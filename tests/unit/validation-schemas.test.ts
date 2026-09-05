import { describe, expect, it } from "vitest";
import {
  signUpSchema,
  signInSchema,
  brandSchema,
  competitorSchema,
  competitorListSchema,
  socialProfileSchema,
  createAuditSchema,
  leadCaptureSchema,
  assetUploadMetaSchema,
  leadStatusUpdateSchema,
  MAX_ASSET_FILE_SIZE_BYTES,
} from "@/lib/validation/schemas";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("signUpSchema", () => {
  it("accepts a valid signup payload", () => {
    const result = signUpSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "supersecure123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({
      fullName: "Jane Doe",
      email: "not-an-email",
      password: "supersecure123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = signUpSchema.safeParse({
      fullName: "   ",
      email: "jane@example.com",
      password: "supersecure123",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a non-empty password but does not enforce length", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("brandSchema", () => {
  it("accepts a minimal valid brand with only the required field set", () => {
    const result = brandSchema.safeParse({ name: "Northstar Coffee" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing business name", () => {
    expect(brandSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts an empty-string website_url (optional field pattern)", () => {
    expect(brandSchema.safeParse({ name: "Acme", website_url: "" }).success).toBe(true);
  });

  it("rejects a malformed website_url", () => {
    expect(brandSchema.safeParse({ name: "Acme", website_url: "not a url" }).success).toBe(false);
  });

  it("accepts a well-formed website_url", () => {
    expect(brandSchema.safeParse({ name: "Acme", website_url: "https://acme.com" }).success).toBe(true);
  });

  it("coerces years_operating from a string and rejects negative values", () => {
    expect(brandSchema.safeParse({ name: "Acme", years_operating: "5" }).data?.years_operating).toBe(5);
    expect(brandSchema.safeParse({ name: "Acme", years_operating: -1 }).success).toBe(false);
  });
});

describe("competitorSchema / competitorListSchema", () => {
  it("requires a competitor name", () => {
    expect(competitorSchema.safeParse({ name: "" }).success).toBe(false);
    expect(competitorSchema.safeParse({ name: "Rival Co" }).success).toBe(true);
  });

  it("caps the competitor list at 5 entries (spec §35)", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `Competitor ${i}` }));
    const five = six.slice(0, 5);
    expect(competitorListSchema.safeParse(six).success).toBe(false);
    expect(competitorListSchema.safeParse(five).success).toBe(true);
  });
});

describe("socialProfileSchema", () => {
  it("only accepts known platforms", () => {
    expect(socialProfileSchema.safeParse({ platform: "instagram" }).success).toBe(true);
    expect(socialProfileSchema.safeParse({ platform: "myspace" }).success).toBe(false);
  });
});

describe("createAuditSchema", () => {
  it("requires a uuid brand_id and a valid audit_type", () => {
    expect(createAuditSchema.safeParse({ brand_id: VALID_UUID, audit_type: "quick" }).success).toBe(true);
    expect(createAuditSchema.safeParse({ brand_id: VALID_UUID, audit_type: "deep" }).success).toBe(true);
    expect(createAuditSchema.safeParse({ brand_id: "not-a-uuid", audit_type: "quick" }).success).toBe(false);
    expect(createAuditSchema.safeParse({ brand_id: VALID_UUID, audit_type: "thorough" }).success).toBe(false);
  });
});

describe("leadCaptureSchema", () => {
  const base = {
    share_token: "aB3dEf6hIj9kLm2nOp5qRs8t",
    name: "Jane Doe",
    email: "jane@example.com",
    consent_marketing: true,
  };

  it("accepts a valid lead with explicit consent", () => {
    expect(leadCaptureSchema.safeParse(base).success).toBe(true);
    expect(leadCaptureSchema.safeParse({ ...base, consent_marketing: false }).success).toBe(true);
  });

  it("rejects a missing or too-short share token", () => {
    // Format alone can't distinguish a real token from a lookalike string —
    // that's enforced server-side by resolving it against the audit_shares
    // table (see submitLeadAction) and rejecting anything that isn't an
    // active, non-expired share. This schema only sanity-checks length.
    expect(leadCaptureSchema.safeParse({ ...base, share_token: "" }).success).toBe(false);
    expect(leadCaptureSchema.safeParse({ ...base, share_token: "short" }).success).toBe(false);
  });

  it("rejects a missing/invalid email", () => {
    expect(leadCaptureSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(leadCaptureSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rejects a non-boolean consent value (consent must be an explicit choice)", () => {
    // safeParse's input is `unknown`, so this is a runtime-only check —
    // no `as` cast or ts-expect-error needed to pass a wrong-shaped value.
    expect(leadCaptureSchema.safeParse({ ...base, consent_marketing: "yes" }).success).toBe(false);
  });
});

describe("assetUploadMetaSchema", () => {
  it("accepts an allowed mime type under the size cap", () => {
    const result = assetUploadMetaSchema.safeParse({
      audit_id: VALID_UUID,
      file_name: "logo.png",
      mime_type: "image/png",
      file_size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a disallowed mime type", () => {
    const result = assetUploadMetaSchema.safeParse({
      audit_id: VALID_UUID,
      file_name: "script.exe",
      mime_type: "application/x-msdownload",
      file_size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a file over the 10MB cap", () => {
    const result = assetUploadMetaSchema.safeParse({
      audit_id: VALID_UUID,
      file_name: "huge.png",
      mime_type: "image/png",
      file_size: MAX_ASSET_FILE_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("leadStatusUpdateSchema", () => {
  it("only accepts the defined lead statuses", () => {
    expect(leadStatusUpdateSchema.safeParse({ lead_id: VALID_UUID, status: "qualified" }).success).toBe(true);
    expect(leadStatusUpdateSchema.safeParse({ lead_id: VALID_UUID, status: "ghosted" }).success).toBe(false);
  });
});
