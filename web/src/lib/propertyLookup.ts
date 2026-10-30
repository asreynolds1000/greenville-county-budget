/**
 * Browser-only Greenville County parcel lookup for the property-tax estimate.
 *
 * An address and PIN are used only in requests from the resident's browser to
 * Greenville County GIS.  This module deliberately contains no persistence,
 * telemetry, URL mutation, or logging.  The lookup layer supplies a parcel and
 * district; the estimate layer must supply the separately curated millage data.
 */

const GIS_ORIGIN = "https://www.gcgis.org";
const GIS_BASE = `${GIS_ORIGIN}/arcgis3/rest/services`;
const PARCEL_URL = `${GIS_BASE}/GreenvilleNJ/Tax_Parcel_Search_and_Select/MapServer/0/query`;
const GEOCODER_URL = `${GIS_BASE}/Address_Locators/GreenvilleNJ_AddressPoint_Locator/GeocodeServer`;
const PARCEL_FIELDS = "PIN,LOCATE,STRNUM,TAXMKTVAL,DIST";
const PARCEL_SR = 6570;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_SUGGESTIONS = 8;

export type PropertyMatch = {
  /** County GIS PIN. Keep this as a string: leading zeroes are significant. */
  pin: string;
  /** The parcel layer's site-address fields, never an owner mailing address. */
  address: string;
  /** County three-digit tax district, or "Unsupported" when GIS does not supply one. */
  district: string;
  /** County GIS TAXMKTVAL, not a tax bill or a homeowner's exemption-adjusted value. */
  taxableMarketValue: number | null;
};

export type PropertySuggestion = {
  /** County geocoder's display address. */
  label: string;
  /** Opaque county key. Resolve only a key issued in a suggestion response. */
  magicKey: string;
};

export type PropertySearchResult =
  | { kind: "matches"; matches: PropertyMatch[] }
  | { kind: "suggestions"; suggestions: PropertySuggestion[] }
  | { kind: "no_match" }
  | { kind: "unavailable" }
  | { kind: "aborted" };

type ArcGisFeature = { attributes?: Record<string, unknown> };
type ArcGisResponse = {
  error?: unknown;
  features?: ArcGisFeature[];
  suggestions?: Array<{ text?: unknown; magicKey?: unknown }>;
  candidates?: Array<{ location?: { x?: unknown; y?: unknown } }>;
  spatialReference?: { wkid?: unknown; latestWkid?: unknown };
};

type RequestResult =
  | { kind: "response"; body: ArcGisResponse }
  | { kind: "unavailable" }
  | { kind: "aborted" };

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegativeNumberOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && number >= 0 ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedDistrict(value: unknown): string | null {
  const district = textOrNull(value);
  return district && /^\d{3}$/.test(district) ? district : null;
}

function isParcelSpatialReference(value: ArcGisResponse["spatialReference"]): boolean {
  // ArcGIS currently returns the legacy ESRI wkid 103146 alongside
  // latestWkid 6570, even when the request says outSR=6570.  The latter is the
  // authoritative equivalence marker; do not accept any other projection.
  return value?.wkid === PARCEL_SR || value?.latestWkid === PARCEL_SR;
}

/**
 * County PINs are 13 characters: either all digits or one municipal prefix
 * followed by 12 digits.  Strip presentation separators, never number-cast,
 * and preserve a leading zero.  Restricting this shape prevents an address
 * such as "50 S MAIN" from being mistaken for a PIN.
 */
export function normalizePropertyPin(query: string): string | null {
  const pin = query.trim().replace(/[\s-]+/g, "").toUpperCase();
  return /^(?:\d{13}|[A-Z]\d{12})$/.test(pin) ? pin : null;
}

function makeUrl(path: string, params: Record<string, string>): string {
  const url = new URL(path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function requestJson(url: string, signal?: AbortSignal): Promise<RequestResult> {
  if (signal?.aborted) return { kind: "aborted" };

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return { kind: "unavailable" };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || "error" in body) {
      return { kind: "unavailable" };
    }
    return { kind: "response", body: body as ArcGisResponse };
  } catch {
    return signal?.aborted ? { kind: "aborted" } : { kind: "unavailable" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function parcelUrl(where: string): string {
  return makeUrl(PARCEL_URL, {
    f: "json",
    where,
    outFields: PARCEL_FIELDS,
    returnGeometry: "false",
  });
}

function parcelAtPointUrl(x: number, y: number): string {
  return makeUrl(PARCEL_URL, {
    f: "json",
    geometry: JSON.stringify({ x, y, spatialReference: { wkid: PARCEL_SR } }),
    geometryType: "esriGeometryPoint",
    inSR: String(PARCEL_SR),
    spatialRel: "esriSpatialRelIntersects",
    outFields: PARCEL_FIELDS,
    returnGeometry: "false",
  });
}

function matchesResult(result: RequestResult): PropertySearchResult {
  if (result.kind !== "response") return result;
  if (!Array.isArray(result.body.features)) return { kind: "unavailable" };

  const matches: PropertyMatch[] = [];
  for (const row of result.body.features) {
    if (!isRecord(row.attributes)) return { kind: "unavailable" };
    const attrs = row.attributes;
    const pin = textOrNull(attrs.PIN);
    const district = normalizedDistrict(attrs.DIST);
    const taxableMarketValue = attrs.TAXMKTVAL === null || attrs.TAXMKTVAL === undefined
      ? null
      : nonnegativeNumberOrNull(attrs.TAXMKTVAL);
    if (!pin || !district || taxableMarketValue === null && attrs.TAXMKTVAL !== null && attrs.TAXMKTVAL !== undefined) {
      return { kind: "unavailable" };
    }
    const number = textOrNull(attrs?.STRNUM);
    const street = textOrNull(attrs?.LOCATE);
    matches.push({
      pin,
      address: [number, street].filter(Boolean).join(" ") || "Address unavailable",
      district,
      taxableMarketValue,
    });
  }
  return matches.length ? { kind: "matches", matches } : { kind: "no_match" };
}

/**
 * Look up an exact PIN or ask the county geocoder for address choices.
 * Address input is intentionally not parcel-searched or fuzzy-geocoded here;
 * the resident must explicitly choose one of the county's suggestions and call
 * `resolvePropertySuggestion`.
 */
export async function searchProperties(
  query: string,
  signal?: AbortSignal,
): Promise<PropertySearchResult> {
  const pin = normalizePropertyPin(query);
  if (pin) return matchesResult(await requestJson(parcelUrl(`PIN = '${pin}'`), signal));

  const text = query.trim().replace(/\s+/g, " ");
  if (text.length < 3) return { kind: "no_match" };
  const result = await requestJson(makeUrl(`${GEOCODER_URL}/suggest`, {
    f: "json",
    text,
  }), signal);
  if (result.kind !== "response") return result;

  if (!Array.isArray(result.body.suggestions)) return { kind: "unavailable" };

  const seen = new Set<string>();
  const suggestions: PropertySuggestion[] = [];
  for (const item of result.body.suggestions) {
    const label = textOrNull(item.text);
    const magicKey = textOrNull(item.magicKey);
    if (!label || !magicKey || seen.has(magicKey)) continue;
    seen.add(magicKey);
    suggestions.push({ label, magicKey });
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return suggestions.length ? { kind: "suggestions", suggestions } : { kind: "no_match" };
}

/** Resolve only an opaque key returned by `searchProperties`; never geocode free text. */
export async function resolvePropertySuggestion(
  suggestion: PropertySuggestion,
  signal?: AbortSignal,
): Promise<PropertySearchResult> {
  const magicKey = textOrNull(suggestion.magicKey);
  if (!magicKey || magicKey.length > 512) return { kind: "no_match" };

  const geocode = await requestJson(makeUrl(`${GEOCODER_URL}/findAddressCandidates`, {
    f: "json",
    magicKey,
    outFields: "AddNum,StName",
    maxLocations: "1",
    outSR: String(PARCEL_SR),
  }), signal);
  if (geocode.kind !== "response") return geocode;

  // The parcel layer and its point query use SC State Plane 6570. Never send a
  // point onward if the county geocoder changes that contract: a plausible
  // parcel in a different coordinate system is worse than an unavailable lookup.
  if (!isParcelSpatialReference(geocode.body.spatialReference) || !Array.isArray(geocode.body.candidates)) {
    return { kind: "unavailable" };
  }
  if (!geocode.body.candidates.length) return { kind: "no_match" };
  const location = geocode.body.candidates[0].location;
  const x = numberOrNull(location?.x);
  const y = numberOrNull(location?.y);
  if (x === null || y === null) return { kind: "unavailable" };
  return matchesResult(await requestJson(parcelAtPointUrl(x, y), signal));
}
