import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CorrectionsPage from "@/app/corrections/page";
import { getCorrections } from "@/lib/loaders";

vi.mock("@/lib/loaders", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/loaders")>(),
  getCorrections: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

describe("correction entity destinations", () => {
  for (const [fiscalYear, expected] of [["", "/e/dept.informationsytems/"],
    ["2026", "/e/dept.informationsytems/?fy=2026"],
    ["2014", "/e/dept.informationsytems/"], ["2026x", "/e/dept.informationsytems/"]] as const) {
    it(`only links a real covered fiscal year (${JSON.stringify(fiscalYear)})`, () => {
      vi.mocked(getCorrections).mockReturnValue({ data_version: "test", corrections: [{
        correction_id: "test", corrected_on: "2026-09-07", scope_entity_id: "dept.informationsytems",
        fiscal_year: fiscalYear, what_changed: "Name corrected", why: "Source verified", source_ref: "",
      }] });
      const html = renderToStaticMarkup(<CorrectionsPage />);
      const link = /<a[^>]+href="([^"]*)"[^>]*>(dept\.informationsytems[^<]*)<\/a>/.exec(html);
      const destination = new URL(link?.[1] ?? "/missing", "https://example.test");
      const target = new URL(expected, "https://example.test");
      expect(destination.pathname).toBe(target.pathname);
      expect(destination.search).toBe(target.search);
      expect(link?.[2]).toBe(fiscalYear ? `dept.informationsytems FY${fiscalYear}` : "dept.informationsytems");
    });
  }
});
