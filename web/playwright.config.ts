import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression harness (plan Step 0, cold-review finding R2).
 *
 * The repository's 45 unit tests cover pure logic; every defect this polish pass exists to
 * fix is a RENDERING defect — a total that includes a line it should not, a source column
 * pushed off a 320px viewport, a year that no control can reach. None of those are visible
 * to Vitest, which is why the review refused "add a browser assertion" as an executable
 * instruction until a runner was named.
 *
 * Chromium only, on purpose. This is a regression net for specific known defects, not a
 * cross-browser compatibility matrix — three engines would triple CI time for the same
 * signal at this stage.
 *
 * Runs against the STATIC EXPORT (`npm run build` → `out/`), not `next dev`. The production
 * artifact is what ships; dev-mode differences (no export-time data validation, different
 * hydration timing) would make a green suite say less than it appears to.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://127.0.0.1:4321",
    // Failure artifacts only. Committed golden screenshots would turn every legitimate
    // copy edit into a diff to triage, which is how a fixture earns a reputation for
    // crying wolf (napkin, page baselines).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // `next start` does not serve an `output: "export"` build. Serving `out/` directly is
  // also the closest thing to how a static host will serve it.
  webServer: {
    command: "node scripts/serve-out.mjs",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
