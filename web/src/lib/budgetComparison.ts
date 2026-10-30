import type { PrintedForm } from "./schema";

export type SpendingLine = {
  id: string;
  name: string;
  value: number | null;
  printedForm: PrintedForm | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
};
export type SpendingSnapshot = {
  year: number;
  total: number | null;
  detailTotal: number | null;
  categories: SpendingLine[];
  departments: SpendingLine[];
};
export type SpendingBoundary = { year: number; entityId: string | null; text: string };

/** A growth claim needs the same published line throughout the interval. */
export function compareSpendingLine(
  id: string,
  kind: "categories" | "departments",
  snapshots: SpendingSnapshot[],
  fromYear: number,
  toYear: number,
  boundaries: SpendingBoundary[],
) {
  const start = snapshots.find((s) => s.year === fromYear)?.[kind].find((r) => r.id === id);
  const end = snapshots.find((s) => s.year === toYear)?.[kind].find((r) => r.id === id);
  const lower = Math.min(fromYear, toYear);
  const upper = Math.max(fromYear, toYear);
  const reasons = boundaries.filter((b) => b.year > lower && b.year <= upper
    && (b.entityId === null || b.entityId === id)).map((b) => b.text);
  for (let year = lower; year <= upper; year++) {
    const line = snapshots.find((s) => s.year === year)?.[kind].find((r) => r.id === id);
    if (line?.value === null || line?.value === undefined) {
      reasons.push("This line does not have a published adopted amount in every selected year.");
      break;
    }
  }
  const comparable = reasons.length === 0 && start?.value != null && end?.value != null;
  const difference = comparable ? end!.value! - start!.value! : null;
  const percent = difference !== null && start!.value! > 0 ? difference / start!.value! * 100 : null;
  return { start, end, difference, percent, reasons: [...new Set(reasons)] };
}

export type RegroupingBanner = { message: string; start: number; coveredReasons: string[] };

/**
 * A documented reorganization boundary is entity-independent (`entityId` is null, produced from
 * a county-wide series-split note), unlike a single entity's own parent-change note. When one
 * falls inside the selected span, every row of the selected kind carries the identical reason,
 * which a single banner should say once rather than as an identical explainer on every row.
 * `start` is the latest such boundary at or before `toYear`: the earliest `from` that reaches
 * `toYear` without crossing one, i.e. the longest fully comparable window ending at `toYear`.
 */
export function regroupingBanner(boundaries: SpendingBoundary[], fromYear: number, toYear: number): RegroupingBanner | null {
  const lower = Math.min(fromYear, toYear);
  const upper = Math.max(fromYear, toYear);
  const reorganizations = boundaries.filter((b) => b.entityId === null);
  const crossedYears = [...new Set(reorganizations.filter((b) => b.year > lower && b.year <= upper).map((b) => b.year))].sort((a, b) => a - b);
  if (crossedYears.length === 0) return null;
  const start = Math.max(...crossedYears);
  const coveredReasons = [...new Set(reorganizations.filter((b) => crossedYears.includes(b.year)).map((b) => b.text))];
  const labels = crossedYears.map((year) => `FY${year}`);
  const clause = labels.length === 1 ? labels[0]
    : labels.length === 2 ? `${labels[0]} and again in ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")}, and again in ${labels[labels.length - 1]}`;
  const message = `Departments were regrouped in ${clause}, so a change is not calculated across those years. `
    + `The longest comparable window ending FY${toYear} is FY${start}–FY${toYear}.`;
  return { message, start, coveredReasons };
}

/** The first sentence of a longer note, for a one-line mention beside a row. */
export function shortenReason(text: string): string {
  const breakAt = text.indexOf(". ");
  return breakAt === -1 ? text : text.slice(0, breakAt + 1);
}
