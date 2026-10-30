import { normalizePropertyPin } from "./propertyLookup";

/** Tax-year-specific facts from the county's Real Property Details record. */
export type PropertyRecord = {
  pin: string;
  taxYear: number;
  receipt: string;
  item: string;
  district: string;
  taxableMarketValue: number | null;
  assessmentClass: string | null;
  assessmentRatio: 4 | 6 | null;
  homestead: boolean | null;
  /** The county record's Taxes field, not a recipient allocation or amount paid. */
  taxes: number | null;
};

export type PropertyRecordResult =
  | { kind: "found"; record: PropertyRecord }
  | { kind: "unavailable" }
  | { kind: "aborted" };

function isMoney(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100);
}

function isPropertyRecord(value: unknown, pin: string, taxYear: number): value is PropertyRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.pin === pin && record.taxYear === taxYear
    && typeof record.receipt === "string" && /^\d{1,20}$/.test(record.receipt)
    && typeof record.item === "string" && /^\d{1,20}$/.test(record.item)
    && typeof record.district === "string" && /^\d{3}$/.test(record.district)
    && isMoney(record.taxableMarketValue) && isMoney(record.taxes)
    && (record.assessmentClass === null || (typeof record.assessmentClass === "string" && record.assessmentClass.length <= 120))
    && [null, 4, 6].includes(record.assessmentRatio as number | null)
    && (record.homestead === null || typeof record.homestead === "boolean");
}

export function propertyRecordSourceUrl(pin: string, taxYear: number, record?: Pick<PropertyRecord, "receipt" | "item"> | null): string {
  const url = new URL("https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx");
  url.searchParams.set("MapNumber", pin);
  url.searchParams.set("TaxYear", String(taxYear));
  if (record) {
    url.searchParams.set("Receipt", record.receipt);
    url.searchParams.set("Item", record.item);
  }
  return url.toString();
}

/** Send only the selected PIN and year; no address, owner fields, or URL query. */
export async function loadPropertyRecord(pin: string, taxYear: number, signal?: AbortSignal): Promise<PropertyRecordResult> {
  if (signal?.aborted) return { kind: "aborted" };
  if (normalizePropertyPin(pin) !== pin || taxYear !== 2025) return { kind: "unavailable" };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch("/api/property-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, taxYear }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { kind: "unavailable" };
    const body: unknown = await response.json();
    if (signal?.aborted) return { kind: "aborted" };
    if (!body || typeof body !== "object" || !("record" in body) || !isPropertyRecord(body.record, pin, taxYear)) return { kind: "unavailable" };
    return { kind: "found", record: body.record };
  } catch {
    return { kind: signal?.aborted ? "aborted" : "unavailable" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
