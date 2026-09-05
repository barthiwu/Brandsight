import { test, expect } from "@playwright/test";

/**
 * Happy-path E2E: sign up -> create a brand -> start a Quick Audit ->
 * answer every required onboarding question -> submit for processing ->
 * land on the report once processing finishes -> see the score.
 *
 * Requires a running app server (see playwright.config.ts) backed by a
 * real Supabase project AND a working OpenAI key, since the audit
 * pipeline genuinely runs. Skipped unless RUN_LIVE_E2E_TESTS=1 is set —
 * this sandbox cannot reach either service (see tests/helpers/liveEnv.ts),
 * so this spec has been written and reviewed but never executed.
 */
test.skip(process.env.RUN_LIVE_E2E_TESTS !== "1", "Requires a live app server, Supabase project, and OpenAI key.");

test("a new user can sign up, create a brand, and complete a Quick Audit", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const password = "E2eTestPassword123!";

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("E2E Test User");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole("button", { name: /sign up|create account/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  await test.step("create a brand", async () => {
    await page.goto("/brands/new");
    await page.getByLabel(/business name/i).fill("Northstar Coffee");
    await page.getByRole("button", { name: /save|create/i }).click();
    await expect(page).toHaveURL(/\/brands\/[0-9a-f-]+/, { timeout: 15_000 });
  });

  await test.step("start a quick audit", async () => {
    await page.goto("/audits/new");
    await page.getByRole("radio", { name: /quick/i }).check();
    await page.getByRole("button", { name: /start|continue/i }).click();
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]+/, { timeout: 15_000 });
  });

  await test.step("answer required onboarding questions and submit", async () => {
    // The wizard walks through sections defined in
    // src/lib/questions/config.ts; only required fields are exercised here.
    const requiredTextFields: Record<string, string> = {
      "industry": "Coffee & Café",
      "country": "United States",
      "business description": "A neighborhood specialty coffee shop.",
      "primary product/service": "Specialty coffee and pastries",
      "business model": "B2C retail",
      "biggest marketing challenge": "Low foot traffic on weekdays.",
      "ideal customer": "Local professionals and students who value quality coffee.",
      "what problem do you solve": "Convenient, high-quality coffee near work/school.",
      "why do customers choose you": "Better quality and a welcoming space than chains nearby.",
      "what makes you different": "In-house roasting and a loyalty program.",
      "how often do you publish": "2-3 times per week",
    };

    for (const [labelFragment, value] of Object.entries(requiredTextFields)) {
      const field = page.getByLabel(new RegExp(labelFragment, "i"));
      if (await field.count()) {
        await field.first().fill(value);
      }
      const nextButton = page.getByRole("button", { name: /next|continue/i });
      if (await nextButton.count()) {
        await nextButton.first().click();
      }
    }

    await page.getByRole("button", { name: /submit|finish|run audit/i }).click();
  });

  await test.step("processing eventually completes and shows a report", async () => {
    await expect(page.getByText(/processing/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/brandsight score|overall score/i)).toBeVisible({ timeout: 120_000 });
  });
});
