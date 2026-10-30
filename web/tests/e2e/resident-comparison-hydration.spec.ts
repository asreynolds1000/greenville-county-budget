import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  for (const year of [2026, 2025]) {
    test(`comparison input survives delayed hydration at ${width}px for FY${year}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      let releaseHydration!: () => void;
      const hydrationGate = new Promise<void>((resolve) => { releaseHydration = resolve; });
      // Serve the real exported HTML while holding all client JavaScript. No timer or
      // CPU-speed assumption can let a React change handler attach before these assertions.
      await page.route("**/_next/static/**/*.js", async (route) => {
        await hydrationGate;
        await route.continue();
      });

      try {
        await page.goto(`/e/budget.total/?fy=${year}#change-over-time`, { waitUntil: "commit" });
        const section = page.locator("#change-over-time");
        const basis = section.getByRole("combobox", { name: "Figures to compare", exact: true });
        const earlier = section.getByRole("combobox", { name: "Earlier year", exact: true });
        const later = section.getByRole("combobox", { name: "Later year", exact: true });
        await expect(basis).toBeDisabled();
        await expect(earlier).toBeDisabled();
        await expect(later).toBeDisabled();
        await expect(section).toContainText("$399,316,815");
        await expect(section).toContainText("$477,233,755");

        releaseHydration();
        // Interact immediately: the page's native disabled state, rather than a test
        // readiness wait, must prevent selection until its handler can preserve the input.
        await earlier.selectOption("2016");
        await expect(later).toHaveValue(String(year));
        await expect(earlier).toHaveValue("2016");
        await expect(section).toContainText("$256,805,216");
        await expect(section.getByRole("img")).toHaveAttribute("aria-label", new RegExp(`2016.*${year}`));

        await later.selectOption("2024");
        await expect(earlier).toHaveValue("2016");
        await expect(section.getByRole("img")).toHaveAttribute("aria-label", /2016.*2024/);
        await basis.selectOption({ label: "Proposed budget" });
        await expect(section).toContainText("A draft budget put forward for approval.");
        await basis.selectOption({ label: "Adopted budget" });
        await earlier.selectOption("2016");
        await expect(section).toContainText("$256,805,216");
      } finally {
        releaseHydration();
      }
    });
  }
}
