import { expect, test } from "@playwright/test";

const SITE_URL = "https://gcdata.alexreynolds.com";

test("About identifies the publisher and explains the independent editorial stance", async ({ page }) => {
  await page.goto("/about/");

  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
  await expect(page.getByText(/published by Alex Reynolds/i)).toBeVisible();
  await expect(page.getByText(/does not advocate for a spending level/i)).toBeVisible();
  await expect(page.getByText(/county.s official documents govern/i)).toBeVisible();
  await expect(page.locator('main a[href="/methodology/"]')).toHaveText(/methodology and coverage/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/about/`);
});

test("correction actions prefill the stable context without inventing a figure", async ({ page }) => {
  await page.goto("/e/dept.sheriff/?fy=2026");

  const report = page.getByRole("link", { name: /^report an error$/i });
  await expect(report).toBeVisible();
  const href = await report.getAttribute("href");
  expect(href).toContain("mailto:a@alexreynolds.com?");
  const body = new URL(href ?? "mailto:a@alexreynolds.com").searchParams.get("body") ?? "";
  expect(body).toContain(
    "Page: https://gcdata.alexreynolds.com/e/dept.sheriff/?fy=2026",
  );
  expect(body).toContain("Fiscal year: FY2026");
  expect(body).toContain("Line or fund: dept.sheriff");
  expect(body).toContain("County document:");
});

test("corrections states the county-dispute policy and provides an email action", async ({ page }) => {
  await page.goto("/corrections/");

  await expect(page.getByRole("heading", { name: /what happens when the county disputes/i }))
    .toBeVisible();
  await expect(page.getByText(/both positions are published side by side and cited/i)).toBeVisible();
  const report = page.getByRole("link", { name: /report an error by email/i });
  await expect(report).toHaveAttribute("href", /mailto:a@alexreynolds\.com/);
  const citing = page.locator("section").filter({
    has: page.getByRole("heading", { name: /citing a figure from this site/i }),
  });
  await expect(citing.getByText(/^Data version [a-f0-9]{12}$/i)).toBeVisible();
});

test("robots follows the build environment while canonicals keep the public host", async ({ page }) => {
  await page.goto("/robots.txt");
  const robots = page.locator("body");
  if (process.env.VERCEL_ENV === "production") {
    await expect(robots).toContainText(/allow: \//i);
    await expect(robots).toContainText(`${SITE_URL}/sitemap.xml`);
  } else {
    await expect(robots).toContainText(/disallow: \//i);
  }

  await page.goto("/e/fund.general/?fy=2026");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${SITE_URL}/e/fund.general/`,
  );
});
