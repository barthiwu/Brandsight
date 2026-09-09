import path from "node:path";
import { test, expect } from "@playwright/test";
import { randomTestEmail } from "../helpers/liveEnv";

// Playwright's test files compile under CommonJS here (not ESM — the repo's
// own tooling warns about this mismatch elsewhere, e.g. vitest.config.ts),
// so `__dirname` is used directly rather than the `import.meta.url` +
// `fileURLToPath` pattern, which fails at load time with "Cannot use
// 'import.meta' outside a module" under this project's Playwright config.

/**
 * Deep Audit E2E: sign up -> create a brand -> start a Deep Audit ->
 * answer every required onboarding question -> add a real competitor URL
 * -> set the brand's real website URL -> upload a real brand-asset image
 * -> submit for processing -> land on the report once processing finishes.
 *
 * This is happy-path.spec.ts's sibling: happy-path.spec.ts proved the
 * Quick Audit flow and the core 9-stage pipeline work end-to-end, but a
 * Quick Audit never exercises three code paths that only run for Deep (or
 * only run when a website/competitor/asset is actually provided, which
 * happy-path.spec.ts deliberately skips since those are optional there):
 *
 * 1. Real website fetching (src/lib/evidence/websiteFetcher.ts) — happens
 *    whenever brand.website_url is set, but happy-path.spec.ts never sets
 *    one.
 * 2. Real competitor-site fetching (competitorPipeline.ts) — gated on
 *    `auditType === "deep"` AND the competitor having a URL; a Quick
 *    Audit only ever records the user-typed name/notes, never fetches.
 * 3. Real per-asset OpenAI vision analysis (assetPipeline.ts /
 *    assetAnalysis.ts) — AssetUploadField is only rendered in the wizard
 *    for `auditType === "deep"`.
 *
 * Uses two stable, well-known real sites for the website/competitor
 * fetch targets (not the fictional test brand's own site, which doesn't
 * exist) — picked for being large, static, and unambiguously fine to
 * fetch a single page from with a descriptive bot user-agent
 * (websiteFetcher.ts identifies itself as "BrandSightBot/1.0"), not for
 * any real competitive relationship to the fictional test brand.
 *
 * Requires a running app server backed by a real Supabase project AND a
 * working OpenAI key — same live-only gating as happy-path.spec.ts.
 */
test.skip(process.env.RUN_LIVE_E2E_TESTS !== "1", "Requires a live app server, Supabase project, and OpenAI key.");

test("a new user can sign up and complete a Deep Audit with a real website, competitor, and asset", async ({ page }) => {
  // Deep Audit's pipeline does strictly more real work than Quick (a
  // website fetch, a competitor fetch, and a vision call on top of the
  // same 9 stages happy-path.spec.ts already budgets 300s for), so this
  // gets a larger ceiling rather than reusing that number unchecked.
  test.setTimeout(360_000);

  const email = randomTestEmail();
  const password = "E2eTestPassword123!";
  const brandWebsiteUrl = "https://www.wikipedia.org";
  const competitorUrl = "https://www.mozilla.org";
  const logoPath = path.join(__dirname, "../fixtures/test-logo.png");

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("E2E Deep Audit Tester");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole("button", { name: /sign up|create.*account/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  await test.step("create a brand", async () => {
    await page.goto("/brands/new");
    await page.getByLabel(/business name/i).fill("Cedarwood Bakery");
    await page.getByRole("button", { name: /save|create/i }).click();
    await expect(page).toHaveURL(/\/brands\/[0-9a-f-]+/, { timeout: 15_000 });
  });

  await test.step("start a deep audit", async () => {
    await page.goto("/audits/new");
    // See happy-path.spec.ts for why this is `/^brand/i`, not `/^brand$/i`.
    await page.getByLabel(/^brand/i).selectOption({ label: "Cedarwood Bakery" });
    // Anchored to the start for the same strict-mode reason as
    // happy-path.spec.ts's Quick Audit radio: the OTHER option's own
    // description text contains this option's name too ("Deep Audit:
    // Everything in Quick, plus..." — an unanchored /quick/i would match
    // both radios' accessible names).
    await page.getByRole("radio", { name: /^deep audit/i }).check();
    await page.getByRole("button", { name: /start|continue/i }).click();
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]+/, { timeout: 15_000 });
  });

  await test.step("business section", async () => {
    // business_name is prefilled from the brand we just created.
    await page.getByLabel(/industry/i).fill("Bakery & Café");
    await page.getByLabel(/country/i).fill("United States");
    await page.getByLabel(/business description/i).fill("A neighborhood bakery specializing in sourdough and pastries.");
    await page.getByLabel(/primary product\/service/i).fill("Artisan bread and baked goods");
    await page.getByLabel(/business model/i).fill("B2C retail");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("objectives section", async () => {
    await page.getByLabel(/primary marketing goal/i).selectOption({ label: "More leads" });
    await page.getByLabel(/biggest marketing challenge/i).fill("Low awareness outside the immediate neighborhood.");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("audience section", async () => {
    await page.getByLabel(/who is your ideal customer/i).fill("Local families and professionals who value fresh, quality baked goods.");
    await page.getByLabel(/what problem do you solve/i).fill("Access to genuinely fresh, from-scratch bread and pastries nearby.");
    await page.getByLabel(/why do customers choose you/i).fill("Everything is baked in-house daily, never frozen or shipped in.");
    await page.getByLabel(/what makes you different/i).fill("A dedicated sourdough program and a weekly rotating seasonal menu.");
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("marketing section", async () => {
    const channelsGroup = page.getByRole("group", { name: /which channels do you use/i });
    await channelsGroup.getByRole("checkbox", { name: "Instagram" }).check();
    await channelsGroup.getByRole("checkbox", { name: "Email" }).check();

    await page.getByLabel(/how often do you publish/i).fill("A few times a week");

    const advertisingGroup = page.getByRole("group", { name: /do you currently advertise/i });
    await advertisingGroup.getByRole("radio", { name: "Yes" }).check();

    await page.getByLabel(/who handles your marketing/i).selectOption({ label: "Just me (the founder)" });
    await page
      .getByLabel(/what type of content do you currently produce/i)
      .fill("Instagram photos of daily bakes and an occasional email newsletter.");

    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("competitors section: add one real competitor URL", async () => {
    // Deep-only real behavior under test: gatherCompetitorEvidence only
    // fetches a competitor's URL when auditType === "deep" (see
    // competitorPipeline.ts) — a Quick Audit records this same input as
    // provided-context-only and never fetches it.
    await page.getByLabel(/competitor name/i).fill("Test Competitor Bakery Co");
    // Not `/^website$/i` — same label-vs-accessible-name gap documented in
    // happy-path.spec.ts's brand-select step, except this field isn't even
    // required so there's no asterisk; kept unanchored anyway for the same
    // robustness reason (this label is `"Website (optional)"`, so a fully
    // anchored `/^website$/i` would still miss).
    await page.getByLabel(/website/i).fill(competitorUrl);
    await page.getByRole("button", { name: /add competitor/i }).click();
    await expect(page.getByText("Test Competitor Bakery Co")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
  });

  await test.step("digital section: set website, upload an asset, submit", async () => {
    // Deep-only real behavior under test #1: fetchWebsiteEvidence runs
    // whenever brand.website_url is set (context.ts) — set it here (Quick
    // Audit's happy-path.spec.ts deliberately leaves this blank).
    await page.getByLabel(/^website/i).fill(brandWebsiteUrl);
    await page.getByRole("button", { name: /save website/i }).click();

    // Deep-only real behavior under test #2: AssetUploadField only renders
    // for `auditType === "deep"` — upload a real image and wait for the
    // upload to actually land in Supabase Storage (uploadToSignedUrl is
    // async and unrelated to any debounced autosave) before submitting,
    // since submitting before the upload lands would mean the pipeline's
    // analyzeAuditAssets() sees zero assets and this test would silently
    // stop exercising the vision-analysis path it exists to cover.
    await page.getByLabel(/brand assets/i).setInputFiles(logoPath);
    await expect(page.getByText("✓ test-logo.png")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /submit for analysis/i }).click();
  });

  await test.step("processing eventually completes and shows a report", async () => {
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]+/, { timeout: 15_000 });
    // See happy-path.spec.ts for why this asserts on role="status" rather
    // than any specific rotating message text.
    await expect(page.getByRole("status")).toBeVisible({ timeout: 10_000 });
    // Wider than happy-path.spec.ts's 180s: a Deep Audit does strictly
    // more real work per run (a website fetch, a competitor fetch, and a
    // vision call on the uploaded asset, on top of the same 9 AI stages),
    // so budget more headroom above the Quick Audit's observed ~130s
    // rather than assume Deep finishes in the same window.
    //
    // Not the /brandsight score|overall score/i regex this spec originally
    // used: a real live run's AI-written summary paragraph happened to
    // contain the phrase "overall score" in its own prose, so that regex
    // matched BOTH the report's actual score label AND that unrelated
    // sentence, tripping Playwright's strict mode (found live: the
    // pipeline had genuinely succeeded — this was a test bug, not an app
    // bug). ScoreDisplay.tsx renders the exact literal label "BrandSight
    // Score" unconditionally, regardless of score value or any AI-authored
    // text, so anchor on that instead of a regex that can collide with
    // whatever wording the model happens to produce.
    await expect(page.getByText("BrandSight Score", { exact: true })).toBeVisible({ timeout: 240_000 });
  });
});
