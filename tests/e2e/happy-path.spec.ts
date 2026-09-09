import { test, expect } from "@playwright/test";
import { randomTestEmail } from "../helpers/liveEnv";

/**
 * Happy-path E2E: sign up -> create a brand -> start a Quick Audit ->
 * answer every required onboarding question, section by section -> submit
 * for processing -> land on the report once processing finishes -> see the
 * score.
 *
 * Requires a running app server (see playwright.config.ts) backed by a
 * real Supabase project AND a working OpenAI key, since the audit
 * pipeline genuinely runs. Skipped unless RUN_LIVE_E2E_TESTS=1 is set.
 *
 * Rewritten after the first real live run against this app (see
 * docs/final-build-audit.md / HARDENING_REPORT.md for context) surfaced
 * two real bugs in the original version of this spec, not just gaps in
 * live coverage:
 *
 * 1. The signup button's actual label is "Create free account" — the word
 *    "free" breaks Playwright's contiguous-substring match against
 *    /create account/i, so the original regex never matched it.
 * 2. OnboardingWizard's "Next" button is disabled until EVERY required
 *    question in the CURRENT section has an answer
 *    (isSectionComplete() in src/lib/questions/config.ts) — it is not
 *    per-field. The original spec filled one field, then immediately
 *    clicked "Next" after each one, which only ever worked by accident
 *    for single-required-field sections and otherwise left required
 *    fields unfilled while "Next" stayed disabled. It also never
 *    exercised the select/multiselect/boolean question types at all
 *    (primary_objective, channels, advertising_active,
 *    marketing_team_size) and was missing content_creation_process
 *    entirely.
 *
 * This version fills every required field for a section before clicking
 * "Next", using the interaction pattern each question type actually
 * renders (src/components/audit/QuestionField.tsx):
 *   - text / textarea / number / url -> labeled input, getByLabel().fill()
 *   - select                          -> native <select>, getByLabel().selectOption()
 *   - boolean                         -> <fieldset> of Yes/No radios, scoped by legend
 *   - multiselect                     -> <fieldset> of checkboxes, scoped by legend
 */
test.skip(process.env.RUN_LIVE_E2E_TESTS !== "1", "Requires a live app server, Supabase project, and OpenAI key.");

test("a new user can sign up, create a brand, and complete a Quick Audit", async ({ page }) => {
  // Playwright's default test timeout (60s) covers the WHOLE test, not
  // per step — but the final step alone waits up to 120s for a real
  // 9-stage OpenAI pipeline run to finish, on top of every earlier step's
  // own navigation/action time. Left at the default, this test could never
  // pass even when every individual step behaves correctly. Budget
  // generously for real network + real AI latency, not just the happy path.
  test.setTimeout(300_000);

  const email = randomTestEmail();
  const password = "E2eTestPassword123!";

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("E2E Test User");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole("button", { name: /sign up|create.*account/i }).click();
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
    // No ?brandId= query param, so the Brand select defaults to nothing
    // (see src/app/(app)/audits/new/page.tsx) even though we just created
    // exactly one brand — it has to be picked explicitly or the form
    // rejects submission with "Choose a brand and an audit type."
    // Not `/^brand$/i`: getByLabel() matches the <label> element's raw text
    // content, which literally includes the required-field marker
    // ("Brand *" — FieldWrapper's asterisk span is aria-hidden, so it's
    // stripped from the *accessible name* that getByRole() sees, but not
    // from the label's plain text that getByLabel() matches against). A
    // fully-anchored regex here matched nothing, ever — confirmed live via
    // scripts/debug/debug-brand-select.mjs, which showed
    // getByRole('combobox', ...) resolving fine with accessible name
    // "Brand" while getByLabel(/^brand$/i) resolved to zero elements.
    await page.getByLabel(/^brand/i).selectOption({ label: "Northstar Coffee" });
    // Anchored to the start: the Deep Audit option's own description text
    // ("Everything in Quick, plus...") contains the word "Quick" too, so an
    // unanchored /quick/i matches both labels' full accessible name and
    // trips Playwright's strict mode.
    await page.getByRole("radio", { name: /^quick audit/i }).check();
    await page.getByRole("button", { name: /start|continue/i }).click();
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]+/, { timeout: 15_000 });
  });

  await test.step("business section", async () => {
    // business_name is prefilled from the brand we just created, so it
    // doesn't need to be touched — only the remaining required fields do.
    await page.getByLabel(/industry/i).fill("Coffee & Café");
    await page.getByLabel(/country/i).fill("United States");
    await page.getByLabel(/business description/i).fill("A neighborhood specialty coffee shop.");
    await page.getByLabel(/primary product\/service/i).fill("Specialty coffee and pastries");
    await page.getByLabel(/business model/i).fill("B2C retail");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("objectives section", async () => {
    await page.getByLabel(/primary marketing goal/i).selectOption({ label: "More leads" });
    await page.getByLabel(/biggest marketing challenge/i).fill("Low foot traffic on weekdays.");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("audience section", async () => {
    await page.getByLabel(/who is your ideal customer/i).fill("Local professionals and students who value quality coffee.");
    await page.getByLabel(/what problem do you solve/i).fill("Convenient, high-quality coffee near work or school.");
    await page.getByLabel(/why do customers choose you/i).fill("Better quality and a more welcoming space than the chains nearby.");
    await page.getByLabel(/what makes you different/i).fill("In-house roasting and a loyalty program.");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("marketing section", async () => {
    const channelsGroup = page.getByRole("group", { name: /which channels do you use/i });
    await channelsGroup.getByRole("checkbox", { name: "Instagram" }).check();
    await channelsGroup.getByRole("checkbox", { name: "Email" }).check();

    await page.getByLabel(/how often do you publish/i).fill("2-3 times per week");

    const advertisingGroup = page.getByRole("group", { name: /do you currently advertise/i });
    await advertisingGroup.getByRole("radio", { name: "Yes" }).check();

    await page.getByLabel(/who handles your marketing/i).selectOption({ label: "Just me (the founder)" });
    await page
      .getByLabel(/what type of content do you currently produce/i)
      .fill("Instagram posts and a weekly email newsletter.");

    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("competitors section (optional, skip)", async () => {
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("digital section and submit", async () => {
    // Website/social profiles are optional for a Quick Audit — submit directly.
    await page.getByRole("button", { name: /submit for analysis/i }).click();
  });

  await test.step("processing eventually completes and shows a report", async () => {
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]+/, { timeout: 15_000 });
    // ProcessingView (src/components/audit/ProcessingView.tsx) never renders
    // the literal word "processing" — its LoadingState rotates through
    // messages like "Analyzing your brand across all eight dimensions…",
    // "Reviewing your website and public evidence…", etc. Asserting on that
    // exact word was a test-authoring bug (caught live: this is a stable,
    // real UI with a spinner and role="status", it just never says
    // "processing" anywhere), not an app bug — LoadingState always renders
    // with role="status", regardless of which message is currently showing,
    // so assert on that instead of on any one rotating string.
    await expect(page.getByRole("status")).toBeVisible({ timeout: 10_000 });
    // 120s used to be the budget here, but a real live run completed in
    // 130.7s (12:48:24 -> 12:50:35, see HARDENING_REPORT.md) — comfortably
    // within what the UI itself tells the user to expect ("usually takes a
    // couple of minutes" — ProcessingView.tsx), just over this assertion's
    // old timeout. Widened with headroom rather than trimmed to the exact
    // observed duration, since pipeline timing will vary run to run.
    await expect(page.getByText(/brandsight score|overall score/i)).toBeVisible({ timeout: 180_000 });
  });
});
