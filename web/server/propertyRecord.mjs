/**
 * Minimal server-only importer for Greenville County's public real-property detail page.
 *
 * The county page contains personal fields. This module parses only the explicit tax
 * fields below and never returns, logs, or caches the rest of either county document.
 */
const COUNTY_ORIGIN = "https://www.greenvillecounty.org";
const RESULTS_URL = `${COUNTY_ORIGIN}/appsas400/votaxqry/RealTaxesResults.aspx`;
const DETAILS_URL = `${COUNTY_ORIGIN}/appsas400/RealProperty/Details.aspx`;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_MONEY = 1_000_000_000_000;
const UNAVAILABLE = Symbol("unavailable");

function normalizeText(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeAttribute(value) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function validPin(pin) {
  return typeof pin === "string" && /^(?:\d{13}|[A-Z]\d{12})$/.test(pin);
}

function validTaxYear(taxYear) {
  return typeof taxYear === "number" && Number.isInteger(taxYear) && taxYear >= 1900 && taxYear <= 9999;
}

function validRecordPart(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function tableById(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tables = [...html.matchAll(new RegExp(`<table\\b[^>]*\\bid\\s*=\\s*(["'])${escapedId}\\1[^>]*>([\\s\\S]*?)<\\/table>`, "gi"))];
  return tables.length === 1 ? tables[0][2] : null;
}

function recordRows(table) {
  const rows = new Map();
  for (const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    const heading = row.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
    const cell = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
    if (!heading || !cell) continue;
    const label = normalizeText(heading[1]);
    if (!label) continue;
    const values = rows.get(label) ?? [];
    values.push(normalizeText(cell[1]));
    rows.set(label, values);
  }
  return rows;
}

function exactlyOne(rows, label) {
  const values = rows.get(label);
  return values?.length === 1 ? values[0] : UNAVAILABLE;
}

function optionalCurrency(value) {
  if (value === "" || /^not available$/i.test(value)) return null;
  // The county may append a payment date to its displayed tax amount. Permit
  // only that exact, non-financial annotation; never pick a number from prose.
  const match = value.match(/^\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)(?:\s+(?:Paid\s+On\s+\d{1,2}\/\d{1,2}\/\d{4}|\(Paid\s+On\s+\d{1,2}\/\d{1,2}\/\d{4}\)))?$/i);
  if (!match) return UNAVAILABLE;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_MONEY ? amount : UNAVAILABLE;
}

function returnedTaxYear(value) {
  const years = value.match(/\b\d{4}\b/g) ?? [];
  return years.length === 1 ? Number(years[0]) : UNAVAILABLE;
}

function optionalAssessmentClass(value) {
  if (value === "LR" || value === "LR - Legal Residence") return { assessmentClass: "LR", assessmentRatio: 4 };
  if (value === "OT" || value === "OT - Non-Legal Residence") return { assessmentClass: "OT", assessmentRatio: 6 };
  return { assessmentClass: null, assessmentRatio: null };
}

function optionalHomestead(value) {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

/**
 * Parse one county detail document. Returns null for a changed, incomplete, or
 * ambiguous document rather than guessing at a field or exposing another row.
 */
export function parsePropertyRecord(html, { pin, taxYear }) {
  if (typeof html !== "string" || !validPin(pin) || !validTaxYear(taxYear)) return null;
  const table = tableById(html, "MyData");
  if (!table) return null;
  const rows = recordRows(table);
  const mapNumber = exactlyOne(rows, "Map #:");
  const returnedYear = exactlyOne(rows, "Tax Year:");
  const district = exactlyOne(rows, "District:");
  const taxableMarketValue = exactlyOne(rows, "Taxable Market Value:");
  const assessmentClass = exactlyOne(rows, "Assessment Class:");
  const homestead = exactlyOne(rows, "Homestead Code:");
  const taxes = exactlyOne(rows, "Taxes:");

  if ([mapNumber, returnedYear, district, taxableMarketValue, assessmentClass, homestead, taxes].includes(UNAVAILABLE)) return null;
  if (mapNumber !== pin || returnedTaxYear(returnedYear) !== taxYear || !/^\d{3}$/.test(district)) return null;

  const parsedTaxableValue = optionalCurrency(taxableMarketValue);
  const parsedTaxes = optionalCurrency(taxes);
  const parsedAssessment = optionalAssessmentClass(assessmentClass);
  const parsedHomestead = optionalHomestead(homestead);
  if ([parsedTaxableValue, parsedTaxes, parsedAssessment, parsedHomestead].includes(UNAVAILABLE)) return null;

  return {
    pin,
    taxYear,
    district,
    taxableMarketValue: parsedTaxableValue,
    assessmentClass: parsedAssessment.assessmentClass,
    assessmentRatio: parsedAssessment.assessmentRatio,
    homestead: parsedHomestead,
    taxes: parsedTaxes,
  };
}

function detailIdentity(href, pin, taxYear) {
  let url;
  try {
    url = new URL(decodeAttribute(href), RESULTS_URL);
  } catch {
    return null;
  }
  if (url.origin !== COUNTY_ORIGIN || url.pathname !== "/appsas400/RealProperty/Details.aspx") return null;
  const mapNumber = url.searchParams.get("MapNumber");
  const returnedYear = url.searchParams.get("TaxYear");
  // A result link for this exact parcel/year is material even if its receipt or
  // item is malformed: accepting a neighboring row would select an arbitrary bill.
  if (mapNumber !== pin || returnedYear !== String(taxYear)) return null;
  const expected = ["MapNumber", "TaxYear", "Receipt", "Item"];
  if (url.searchParams.size !== expected.length || expected.some((key) => url.searchParams.getAll(key).length !== 1)) return UNAVAILABLE;
  const receipt = url.searchParams.get("Receipt");
  const item = url.searchParams.get("Item");
  if (!validRecordPart(receipt) || !validRecordPart(item)) return UNAVAILABLE;
  return { receipt, item };
}

/**
 * Select exactly one county-issued detail identity for the requested parcel and
 * year. Result rows for other parcels/years and non-county URLs are ignored.
 */
export function parsePropertyResultSelection(html, { pin, taxYear }) {
  if (typeof html !== "string" || !validPin(pin) || !validTaxYear(taxYear)) return null;
  const table = tableById(html, "tbl_Results");
  if (!table) return null;
  const identities = new Map();
  for (const match of table.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi)) {
    const identity = detailIdentity(match[2], pin, taxYear);
    if (identity === UNAVAILABLE) return null;
    if (identity) identities.set(`${identity.receipt}:${identity.item}`, identity);
  }
  return identities.size === 1 ? [...identities.values()][0] : null;
}

function countyDetailsUrl(pin, taxYear, receipt, item) {
  const url = new URL(DETAILS_URL);
  url.searchParams.set("MapNumber", pin);
  url.searchParams.set("TaxYear", String(taxYear));
  url.searchParams.set("Receipt", receipt);
  url.searchParams.set("Item", item);
  return url.toString();
}

async function fetchHtml(url, fetchImpl, signal) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "text/html" },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
  const contentType = response.headers?.get?.("content-type") ?? "";
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (!response.ok || !/^text\/html(?:;|$)/i.test(contentType) || Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) return null;
  const html = await response.text();
  return new TextEncoder().encode(html).byteLength <= MAX_HTML_BYTES ? html : null;
}

/**
 * Fetch a single, unambiguous public county record without cookies, persistence,
 * or caching. The caller receives null for unavailable, cancelled, malformed,
 * ambiguous, or mismatched county responses.
 *
 * @param {string} pin
 * @param {number} taxYear
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [options]
 */
export async function fetchPropertyRecord(pin, taxYear, { signal, fetchImpl = fetch } = {}) {
  if (!validPin(pin) || !validTaxYear(taxYear) || signal?.aborted) return null;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resultUrl = new URL(RESULTS_URL);
    resultUrl.searchParams.set("SearchType", "MapNumber");
    resultUrl.searchParams.set("Criteria", pin);
    const selection = parsePropertyResultSelection(await fetchHtml(resultUrl.toString(), fetchImpl, controller.signal), { pin, taxYear });
    if (!selection) return null;
    const record = parsePropertyRecord(await fetchHtml(countyDetailsUrl(pin, taxYear, selection.receipt, selection.item), fetchImpl, controller.signal), { pin, taxYear });
    return record ? { ...record, receipt: selection.receipt, item: selection.item } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
