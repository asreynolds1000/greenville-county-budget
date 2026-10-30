import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPropertyRecord, propertyRecordSourceUrl } from "./propertyRecord";

const pin = "0000000000001";
const record = {
  pin, taxYear: 2025, receipt: "123456", item: "01", district: "065", taxableMarketValue: 300000,
  assessmentClass: "LR - Legal Residence", assessmentRatio: 4, homestead: false, taxes: 1306.8,
};
afterEach(() => vi.unstubAllGlobals());

describe("county record browser boundary", () => {
  it("sends only the selected PIN/year in a POST and returns verified record fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ record })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadPropertyRecord(pin, 2025)).toEqual({ kind: "found", record });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/property-record");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST", cache: "no-store", body: JSON.stringify({ pin, taxYear: 2025 }),
    });
  });

  it.each([
    { ...record, pin: "0000000000002" },
    { ...record, taxYear: 2024 },
    { ...record, taxableMarketValue: -1 },
    { ...record, taxableMarketValue: "300000" },
    { ...record, assessmentRatio: 5 },
    { ...record, homestead: "no" },
    { ...record, receipt: null },
    { ...record, item: "unverified" },
  ])("rejects mismatched or malformed record data", async (badRecord) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ record: badRecord }))));
    expect(await loadPropertyRecord(pin, 2025)).toEqual({ kind: "unavailable" });
  });

  it("preserves unknown county fields as unknown", async () => {
    const partial = { ...record, taxableMarketValue: null, assessmentClass: null, assessmentRatio: null, homestead: null, taxes: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ record: partial }))));
    expect(await loadPropertyRecord(pin, 2025)).toEqual({ kind: "found", record: partial });
  });

  it("treats a protected/error HTML response as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Sign in</html>")));
    expect(await loadPropertyRecord(pin, 2025)).toEqual({ kind: "unavailable" });
  });

  it("never requests invalid identities or unsupported years", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadPropertyRecord("some address", 2025)).toEqual({ kind: "unavailable" });
    expect(await loadPropertyRecord(pin, 2026)).toEqual({ kind: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a county reply when the user cancels while it is loading", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify({ record }));
    }));
    expect(await loadPropertyRecord(pin, 2025, controller.signal)).toEqual({ kind: "aborted" });
  });

  it("links directly to the same parcel and year on the official site", () => {
    const url = new URL(propertyRecordSourceUrl(pin, 2025, record));
    expect(url.origin).toBe("https://www.greenvillecounty.org");
    expect(url.searchParams.get("MapNumber")).toBe(pin);
    expect(url.searchParams.get("TaxYear")).toBe("2025");
    expect(url.searchParams.get("Receipt")).toBe("123456");
    expect(url.searchParams.get("Item")).toBe("01");
  });
});
