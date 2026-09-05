import { describe, expect, it } from "vitest";
import { validateAuditReadiness } from "@/lib/questions/validate";

const VALID_QUICK_ANSWERS: Record<string, unknown> = {
  business_name: "Northstar Coffee",
  industry: "Coffee & Café",
  country: "United States",
  business_description: "A neighborhood specialty coffee shop.",
  primary_product_service: "Specialty coffee and pastries",
  business_model: "B2C retail",
  primary_objective: "more_leads",
  biggest_marketing_challenge: "Low weekday foot traffic.",
  ideal_customer: "Local professionals and students.",
  customer_problem: "Convenient, high-quality coffee nearby.",
  customer_reason_to_choose: "Better quality than nearby chains.",
  differentiator: "In-house roasting and a loyalty program.",
  channels: ["instagram", "email"],
  posting_frequency: "2-3 times per week",
  advertising_active: false,
  marketing_team_size: "solo_founder",
  content_creation_process: "Phone photos, posted inconsistently.",
};

describe("validateAuditReadiness", () => {
  it("returns no issues for a fully-answered quick audit", () => {
    expect(validateAuditReadiness("quick", VALID_QUICK_ANSWERS)).toEqual([]);
  });

  it("returns no issues for the same answers on a deep audit (same required set)", () => {
    expect(validateAuditReadiness("deep", VALID_QUICK_ANSWERS)).toEqual([]);
  });

  it("flags every missing required question", () => {
    const issues = validateAuditReadiness("quick", {});
    const flaggedKeys = issues.map((i) => i.question_key);
    expect(flaggedKeys).toContain("business_name");
    expect(flaggedKeys).toContain("primary_objective");
    expect(flaggedKeys).toContain("ideal_customer");
    expect(flaggedKeys).toContain("channels");
    // Optional questions must never be flagged as missing.
    expect(flaggedKeys).not.toContain("city");
    expect(flaggedKeys).not.toContain("marketing_budget_range");
  });

  it("never requires competitors or digital/social questions (those are optional and managed via brand tables)", () => {
    const issues = validateAuditReadiness("deep", VALID_QUICK_ANSWERS);
    const flaggedKeys = issues.map((i) => i.question_key);
    expect(flaggedKeys).not.toContain("competitors");
    expect(flaggedKeys).not.toContain("digital_website_url");
    expect(flaggedKeys).not.toContain("social_profiles");
  });

  it("rejects an invalid select value even though the question is answered", () => {
    const issues = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, primary_objective: "world_domination" });
    expect(issues.some((i) => i.question_key === "primary_objective")).toBe(true);
  });

  it("rejects a multiselect containing an option outside the allowed set", () => {
    const issues = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, channels: ["instagram", "carrier_pigeon"] });
    expect(issues.some((i) => i.question_key === "channels")).toBe(true);
  });

  it("rejects a non-boolean value for a boolean question", () => {
    const issues = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, advertising_active: "yes" });
    expect(issues.some((i) => i.question_key === "advertising_active")).toBe(true);
  });

  it("rejects a malformed URL for an optional url-type question when one is provided", () => {
    const issues = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, website_url: "not a url" });
    expect(issues.some((i) => i.question_key === "website_url")).toBe(true);
  });

  it("accepts a well-formed optional URL and does not require it", () => {
    const withUrl = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, website_url: "https://example.com" });
    const withoutUrl = validateAuditReadiness("quick", VALID_QUICK_ANSWERS);
    expect(withUrl).toEqual([]);
    expect(withoutUrl).toEqual([]);
  });

  it("rejects an out-of-range number for years_operating", () => {
    const issues = validateAuditReadiness("quick", { ...VALID_QUICK_ANSWERS, years_operating: -5 });
    expect(issues.some((i) => i.question_key === "years_operating")).toBe(true);
  });

  it("rejects an overlong textarea answer", () => {
    const issues = validateAuditReadiness("quick", {
      ...VALID_QUICK_ANSWERS,
      business_description: "x".repeat(5000),
    });
    expect(issues.some((i) => i.question_key === "business_description")).toBe(true);
  });
});
