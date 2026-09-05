import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for BrandSight's E2E suite (spec §100). Runs against a
 * local `next dev`/`next start` server pointed at a real (test) Supabase
 * project — it needs a live database and cannot run against mocks, since
 * the flows under test span auth, RLS, and the AI pipeline.
 *
 * NOT executed as part of this build: this sandbox has no outbound network
 * access to Supabase or OpenAI (see tests/helpers/liveEnv.ts and the final
 * build report), and `next build`/`next dev` were not run to serve a live
 * app for Playwright to drive. This file is provided so the suite can be
 * run for the first time against a real environment before launch.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
