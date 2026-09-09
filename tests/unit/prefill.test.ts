import { describe, it, expect } from "vitest";
import { buildAnswersWithBrandPrefill } from "@/lib/questions/prefill";

// Regression test for a real bug found during live E2E testing (see
// tests/e2e/happy-path.spec.ts and HARDENING_REPORT.md): the onboarding
// wizard prefills business-section fields from the brand's existing
// profile so a user doesn't have to retype their business name, industry,
// etc. — and its client-side "is this section complete" check accepts
// that prefilled value without the user ever touching the field. But
// nothing calls the autosave action for a field the user never edited, so
// it never becomes an `audit_responses` row. submitAuditForProcessingAction
// used to validate straight from `audit_responses` alone, so it rejected
// every untouched-but-prefilled field as "missing" — in a real live run,
// that meant Business name (and the rest of the business section) failed
// validation on submission even though the wizard had already shown it as
// filled in and complete.
//
// buildAnswersWithBrandPrefill is the shared fix: both the wizard's
// initial-answers computation and the server-side submit validation now
// build their answer set through this one function, so they can't drift
// apart again. This test exercises it directly rather than only through
// the (much more expensive, real-network) E2E path.

describe("buildAnswersWithBrandPrefill", () => {
  const brand = {
    name: "Northstar Coffee",
    industry: "Coffee & Café",
    country: "United States",
    description: "A neighborhood specialty coffee shop.",
    primary_product_service: "Specialty coffee and pastries",
    business_model: "B2C retail",
    city: "Portland",
    years_operating: 4,
  };

  it("fills business-section fields from the brand when nothing has been saved yet", () => {
    const answers = buildAnswersWithBrandPrefill(brand, {});

    expect(answers.business_name).toBe("Northstar Coffee");
    expect(answers.industry).toBe("Coffee & Café");
    expect(answers.country).toBe("United States");
    expect(answers.business_description).toBe("A neighborhood specialty coffee shop.");
    expect(answers.primary_product_service).toBe("Specialty coffee and pastries");
    expect(answers.business_model).toBe("B2C retail");
    expect(answers.city).toBe("Portland");
    expect(answers.years_operating).toBe(4);
  });

  it("lets an explicitly saved answer override the brand's prefill value", () => {
    const answers = buildAnswersWithBrandPrefill(brand, { industry: "Specialty retail" });

    expect(answers.industry).toBe("Specialty retail");
    // Untouched fields still come from the brand.
    expect(answers.business_name).toBe("Northstar Coffee");
  });

  it("resolves prefillable fields to null, not undefined or a crash, when there is no brand", () => {
    const answers = buildAnswersWithBrandPrefill(null, {});

    expect(answers.business_name).toBeNull();
    expect(answers.industry).toBeNull();
  });

  it("leaves non-prefillable questions to saved answers only", () => {
    const withoutSaved = buildAnswersWithBrandPrefill(brand, {});
    expect(withoutSaved.primary_objective).toBeNull();

    const withSaved = buildAnswersWithBrandPrefill(brand, { primary_objective: "more_leads" });
    expect(withSaved.primary_objective).toBe("more_leads");
  });

  it("includes every question key from the config, not just the prefillable ones", () => {
    const answers = buildAnswersWithBrandPrefill(brand, {});
    // Sanity check across sections other than "business".
    expect(Object.prototype.hasOwnProperty.call(answers, "channels")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(answers, "ideal_customer")).toBe(true);
  });
});
