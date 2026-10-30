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

test("the repository and the data licence are reachable from every page and stated where data is offered", async ({ page }) => {
  await page.goto("/e/dept.sheriff/?fy=2026");
  await expect(page.locator('footer a[href="https://github.com/asreynolds1000/greenville-county-budget"]'))
    .toHaveText(/source code and data/i);
  for (const path of ["/about/", "/downloads/"]) {
    await page.goto(path);
    await expect(page.locator('main a[href="https://creativecommons.org/licenses/by/4.0/"]')).toHaveText(/CC BY 4\.0/);
    await expect(page.locator('main a[href="https://github.com/asreynolds1000/greenville-county-budget"]')).toBeVisible();
    await expect(page.getByText(/still being selected/i)).toHaveCount(0);
  }
});

test("the methodology source guide points readers to the county's popular annual report", async ({ page }) => {
  await page.goto("/methodology/");
  const sources = page.locator("section").filter({
    has: page.getByRole("heading", { name: /every source document/i }),
  });
  await expect(
    sources.locator(
      'a[href="https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2025/pafr2025.pdf"]',
    ),
  ).toHaveText("FY2025 Popular Annual Financial Report");
  await expect(sources.getByText(/the detailed figures and accounting notes are in the ACFR\./)).toBeVisible();
});

test("link previews, the credit, the home canonical and the Dataset markup are in place", async ({ page }) => {
  await page.goto("/e/dept.sheriff/?fy=2026");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE_URL}/og.png`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('footer a[href="https://alexreynolds.com"]')).toHaveText("Alex Reynolds");

  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/`);

  await page.goto("/downloads/");
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  const dataset = JSON.parse(raw ?? "{}");
  expect(dataset["@type"]).toBe("Dataset");
  expect(dataset.license).toBe("https://creativecommons.org/licenses/by/4.0/");
  expect(dataset.distribution.length).toBeGreaterThan(0);
  for (const file of dataset.distribution) {
    const response = await page.request.get(new URL(file.contentUrl).pathname);
    expect(response.status(), file.contentUrl).toBe(200);
  }
});
