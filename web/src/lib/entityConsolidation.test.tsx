import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EntityLatestYearPage, { generateMetadata } from "@/app/e/[entityId]/page";
import sitemap from "@/app/sitemap";

describe("consolidated entity pages", () => {
  it("makes the entity page canonical instead of a compatibility URL", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ entityId: "balance.debt.beginning" }),
    });
    expect(metadata.alternates?.canonical).toBe("/e/balance.debt.beginning/");
  });

  it("renders a year selector and one complete history on the base page", async () => {
    const element = await EntityLatestYearPage({
      params: Promise.resolve({ entityId: "balance.debt.beginning" }),
    });
    const html = renderToStaticMarkup(element);
    expect(html.includes('aria-label="Explore fiscal year"')).toBe(true);
    expect(html.includes('value="2010"')).toBe(true);
    expect(html.includes('value="2026"')).toBe(true);
    expect(html.match(/>History<\/h2>/g)).toHaveLength(1);
    expect(html).toContain("Download this series (CSV)");
    expect(html).toContain("The latest covered year is shown. Enable JavaScript to select another year; the full history and CSV remain available below.");
    expect(html).toContain("$36,090,963");
    expect(html).toContain("$8,773,496");
  });

  it("lists the canonical entity once in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.filter((url) => url.includes("/e/balance.debt.beginning/")))
      .toEqual(["https://gcdata.alexreynolds.com/e/balance.debt.beginning/"]);
  });
});
