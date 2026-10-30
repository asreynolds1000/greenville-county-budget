import { describe, expect, it, vi } from "vitest";

import {
  fetchPropertyRecord,
  parsePropertyRecord,
  parsePropertyResultSelection,
} from "../../server/propertyRecord.mjs";

const pin = "0059000400201";

function detailHtml(overrides: Record<string, string> = {}, duplicate = "") {
  const values = {
    "Map #:": pin,
    "Tax Year:": "2025 — Tax Year",
    "District:": "065",
    "Taxable Market Value:": "$100,000.00",
    "Assessment Class:": "LR - Legal Residence",
    "Homestead Code:": "Yes",
    "Taxes:": "$435.60 (Paid On 11/04/2025)",
    ...overrides,
  };
  return `<table id="MyData">${Object.entries(values).map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("")}${duplicate}</table>`;
}

function officialDetailHref({ mapNumber = pin, taxYear = "2025", receipt = "000123", item = "04" } = {}) {
  return `https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx?MapNumber=${mapNumber}&TaxYear=${taxYear}&Receipt=${receipt}&Item=${item}`;
}

function resultsHtml(hrefs: string[]) {
  return `<table id="tbl_Results">${hrefs.map((href) => `<tr><td><a href="${href.replace(/&/g, "&amp;")}">Record</a></td></tr>`).join("")}</table>`;
}

function htmlResponse(html: string) {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("property-record county page parser", () => {
  it("returns only approved tax fields from a matching county record", () => {
    expect(parsePropertyRecord(detailHtml(), { pin, taxYear: 2025 })).toEqual({
      pin,
      taxYear: 2025,
      district: "065",
      taxableMarketValue: 100_000,
      assessmentClass: "LR",
      assessmentRatio: 4,
      homestead: true,
      taxes: 435.6,
    });
  });

  it("keeps only officially blank or Not Available optional values null", () => {
    expect(parsePropertyRecord(detailHtml({
      "Taxable Market Value:": "Not Available",
      "Assessment Class:": "",
      "Homestead Code:": "",
      "Taxes:": "",
    }), { pin, taxYear: 2025 })).toMatchObject({
      taxableMarketValue: null,
      assessmentClass: null,
      assessmentRatio: null,
      homestead: null,
      taxes: null,
    });
  });

  it("rejects a changed, ambiguous, malformed, or identity-mismatched document", () => {
    expect(parsePropertyRecord(detailHtml({ "Map #:": "0059000400202" }), { pin, taxYear: 2025 })).toBeNull();
    expect(parsePropertyRecord(detailHtml({ "Tax Year:": "2024 — Tax Year" }), { pin, taxYear: 2025 })).toBeNull();
    expect(parsePropertyRecord(detailHtml({ "Taxable Market Value:": "$100,00O.00" }), { pin, taxYear: 2025 })).toBeNull();
    expect(parsePropertyRecord(detailHtml({}, '<tr><th>District:</th><td>065</td></tr>'), { pin, taxYear: 2025 })).toBeNull();
  });

  it("recognizes only the documented LR and OT assessment codes", () => {
    expect(parsePropertyRecord(detailHtml({ "Assessment Class:": "OT - Non-Legal Residence", "Homestead Code:": "No" }), { pin, taxYear: 2025 })).toMatchObject({
      assessmentClass: "OT",
      assessmentRatio: 6,
      homestead: false,
    });
    expect(parsePropertyRecord(detailHtml({ "Assessment Class:": "LR - mixed LR/OT", "Homestead Code:": "Unknown" }), { pin, taxYear: 2025 })).toMatchObject({
      assessmentClass: null,
      assessmentRatio: null,
      homestead: null,
    });
  });
});

describe("property-record result selection", () => {
  it("accepts one distinct county detail identity for the requested parcel and year", () => {
    expect(parsePropertyResultSelection(resultsHtml([officialDetailHref()]), { pin, taxYear: 2025 })).toEqual({ receipt: "000123", item: "04" });
  });

  it("rejects multiple same-year items and ignores other years, maps, and foreign URLs", () => {
    expect(parsePropertyResultSelection(resultsHtml([
      officialDetailHref({ receipt: "000123", item: "04" }),
      officialDetailHref({ receipt: "000124", item: "05" }),
    ]), { pin, taxYear: 2025 })).toBeNull();
    expect(parsePropertyResultSelection(resultsHtml([
      officialDetailHref({ taxYear: "2024" }),
      officialDetailHref({ mapNumber: "0059000400202" }),
      "https://example.invalid/appsas400/RealProperty/Details.aspx?MapNumber=0059000400201&TaxYear=2025&Receipt=000123&Item=04",
      officialDetailHref(),
    ]), { pin, taxYear: 2025 })).toEqual({ receipt: "000123", item: "04" });
  });

  it("rejects malformed or incomplete official link identities", () => {
    expect(parsePropertyResultSelection(resultsHtml([
      officialDetailHref({ receipt: "00A123" }),
    ]), { pin, taxYear: 2025 })).toBeNull();
    expect(parsePropertyResultSelection(resultsHtml([
      officialDetailHref(),
      `https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx?MapNumber=${pin}&TaxYear=2025&Receipt=000123`,
    ]), { pin, taxYear: 2025 })).toBeNull();
  });
});

describe("property-record county fetch", () => {
  it("selects then fetches the one county-issued detail record with no cookies", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(htmlResponse(resultsHtml([officialDetailHref()])))
      .mockResolvedValueOnce(htmlResponse(detailHtml()));
    await expect(fetchPropertyRecord(pin, 2025, { fetchImpl })).resolves.toMatchObject({
      pin,
      taxYear: 2025,
      district: "065",
      receipt: "000123",
      item: "04",
    });
    const [resultUrl, resultInit] = fetchImpl.mock.calls[0];
    const [detailUrl, detailInit] = fetchImpl.mock.calls[1];
    const parsedResult = new URL(resultUrl);
    const parsedDetail = new URL(detailUrl);
    expect(`${parsedResult.origin}${parsedResult.pathname}`).toBe("https://www.greenvillecounty.org/appsas400/votaxqry/RealTaxesResults.aspx");
    expect(parsedResult.searchParams.get("SearchType")).toBe("MapNumber");
    expect(parsedResult.searchParams.get("Criteria")).toBe(pin);
    expect(`${parsedDetail.origin}${parsedDetail.pathname}`).toBe("https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx");
    expect(Object.fromEntries(parsedDetail.searchParams)).toEqual({ MapNumber: pin, TaxYear: "2025", Receipt: "000123", Item: "04" });
    expect(resultInit.credentials).toBe("omit");
    expect(detailInit.cache).toBe("no-store");
  });

  it("does not fetch details for a non-HTML, ambiguous, or caller-cancelled response", async () => {
    const nonHtml = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(fetchPropertyRecord(pin, 2025, { fetchImpl: nonHtml })).resolves.toBeNull();
    const ambiguous = vi.fn().mockResolvedValue(htmlResponse(resultsHtml([officialDetailHref(), officialDetailHref({ receipt: "000124" })])));
    await expect(fetchPropertyRecord(pin, 2025, { fetchImpl: ambiguous })).resolves.toBeNull();
    expect(ambiguous).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    const unused = vi.fn();
    await expect(fetchPropertyRecord(pin, 2025, { signal: controller.signal, fetchImpl: unused })).resolves.toBeNull();
    expect(unused).not.toHaveBeenCalled();
  });
});
