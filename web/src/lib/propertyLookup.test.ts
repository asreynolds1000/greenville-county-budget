import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizePropertyPin,
  resolvePropertySuggestion,
  searchProperties,
} from "./propertyLookup";

const fetchMock = vi.fn();

function json(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("PIN normalization", () => {
  it("preserves leading zeroes and supports letter-prefixed county PINs", () => {
    expect(normalizePropertyPin("0059-0004-00201")).toBe("0059000400201");
    expect(normalizePropertyPin("m000000000001")).toBe("M000000000001");
  });

  it("does not mistake an address or an arbitrary short number for a PIN", () => {
    expect(normalizePropertyPin("50 S MAIN ST")).toBeNull();
    expect(normalizePropertyPin("206")).toBeNull();
  });
});

describe("property lookup", () => {
  it("queries an exact normalized PIN with only the safe parcel fields", async () => {
    fetchMock.mockResolvedValue(json({
      features: [{ attributes: {
        PIN: "0059000400201", STRNUM: "206", LOCATE: "MAIN", DIST: "501", TAXMKTVAL: 500730,
      } }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchProperties("0059-0004-00201")).resolves.toEqual({
      kind: "matches",
      matches: [{
        pin: "0059000400201",
        address: "206 MAIN",
        district: "501",
        taxableMarketValue: 500730,
      }],
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://www.gcgis.org");
    expect(url.searchParams.get("where")).toBe("PIN = '0059000400201'");
    expect(url.searchParams.get("outFields")).toBe("PIN,LOCATE,STRNUM,TAXMKTVAL,DIST");
    expect(url.searchParams.get("outFields")).not.toMatch(/OWN|CITY|ZIP|STREET/i);
  });

  it("returns county address choices without selecting or parcel-searching free text", async () => {
    fetchMock.mockResolvedValue(json({ suggestions: [
      { text: "50 S MAIN ST, GREENVILLE, SC, 29601", magicKey: "county-key-1" },
      { text: "50 S MAIN ST, TRAVELERS REST, SC, 29690", magicKey: "county-key-2" },
    ] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchProperties("50 S MAIN ST")).resolves.toEqual({
      kind: "suggestions",
      suggestions: [
        { label: "50 S MAIN ST, GREENVILLE, SC, 29601", magicKey: "county-key-1" },
        { label: "50 S MAIN ST, TRAVELERS REST, SC, 29690", magicKey: "county-key-2" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/suggest?");
    expect(fetchMock.mock.calls[0][0]).not.toContain("Tax_Parcel_Search");
  });

  it("resolves a user-selected county key through its point, never a fuzzy address", async () => {
    fetchMock
      .mockResolvedValueOnce(json({
        spatialReference: { wkid: 103146, latestWkid: 6570 },
        candidates: [{ location: { x: 1_609_760.84, y: 1_114_378.92 } }],
      }))
      .mockResolvedValueOnce(json({ features: [{ attributes: {
        PIN: "0000000000003", STRNUM: "123", LOCATE: "EXAMPLE", DIST: "276", TAXMKTVAL: 251000,
      } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePropertySuggestion({ label: "123 EXAMPLE LN", magicKey: "county-key" })).resolves.toEqual({
      kind: "matches",
      matches: [{
        pin: "0000000000003",
        address: "123 EXAMPLE",
        district: "276",
        taxableMarketValue: 251000,
      }],
    });

    const geocoder = new URL(fetchMock.mock.calls[0][0]);
    expect(geocoder.searchParams.get("magicKey")).toBe("county-key");
    expect(geocoder.searchParams.get("outSR")).toBe("6570");
    expect(geocoder.searchParams.has("SingleLine")).toBe(false);
    const parcel = new URL(fetchMock.mock.calls[1][0]);
    expect(parcel.searchParams.get("geometryType")).toBe("esriGeometryPoint");
    expect(parcel.searchParams.get("spatialRel")).toBe("esriSpatialRelIntersects");
  });

  it("distinguishes a no-match from an unavailable county service and caller cancellation", async () => {
    fetchMock.mockResolvedValueOnce(json({ features: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchProperties("0059000400201")).resolves.toEqual({ kind: "no_match" });

    fetchMock.mockResolvedValueOnce(json({ error: { code: 500 } }));
    await expect(searchProperties("0059000400201")).resolves.toEqual({ kind: "unavailable" });

    const controller = new AbortController();
    controller.abort();
    await expect(searchProperties("0059000400201", controller.signal)).resolves.toEqual({ kind: "aborted" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats malformed arrays, an ArcGIS 200 error, and invalid parcel values as unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ suggestions: {} }))
      .mockResolvedValueOnce(json({ error: { code: 400 } }))
      .mockResolvedValueOnce(json({ features: [{ attributes: {
        PIN: "0059000400201", DIST: "501", TAXMKTVAL: -1,
      } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchProperties("301 University Ridge")).resolves.toEqual({ kind: "unavailable" });
    await expect(searchProperties("301 University Ridge")).resolves.toEqual({ kind: "unavailable" });
    await expect(searchProperties("0059000400201")).resolves.toEqual({ kind: "unavailable" });
  });

  it("keeps valid empty arrays as no match, but rejects a changed geocoder spatial reference", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ suggestions: [] }))
      .mockResolvedValueOnce(json({
        spatialReference: { wkid: 4326 },
        candidates: [{ location: { x: -82.4, y: 34.8 } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchProperties("301 University Ridge")).resolves.toEqual({ kind: "no_match" });
    await expect(resolvePropertySuggestion({ label: "301 UNIVERSITY RIDGE", magicKey: "county-key" })).resolves.toEqual({
      kind: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns aborted when cancellation wins an in-flight request", async () => {
    fetchMock.mockImplementation((_: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = searchProperties("0059000400201", controller.signal);
    controller.abort();

    await expect(pending).resolves.toEqual({ kind: "aborted" });
  });
});
