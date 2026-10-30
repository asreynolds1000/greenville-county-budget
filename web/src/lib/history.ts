import type { DataNote, EntityBreak, V2EntityPage, V2SeriesPoint } from "./schema";
import { formatAmount } from "./format";

/**
 * One explicitly labelled series inside an entity page.
 *
 * An entity can legitimately publish more than one status or measure. Keeping those in
 * separate bases is the guardrail that stops an adopted budget and an audited actual from
 * becoming a single, invented trend.
 */
export type HistoryBasis = {
  key: string;
  measureType: string;
  statusClass: string;
  points: V2SeriesPoint[];
};

/** A boundary that is visible to readers and prevents a chart from inventing continuity. */
export type HistoryBreak = {
  blocksComparison: boolean;
  fiscalYear: number;
  headline: string;
  id: string;
  kind: "gap" | "parent_change" | "series_break";
  text: string;
};

/** The serializable data a client comparison needs; server loaders stay out of the client. */
export type EntityHistoryModel = {
  breaks: HistoryBreak[];
  bases: HistoryBasis[];
  defaultBasisKey: string | null;
  selectedYear: number;
};

export type HistoryComparison = {
  difference: number | null;
  end: V2SeriesPoint | null;
  gapYears: number[];
  percentDifference: number | null;
  reason: "break" | "missing-endpoint" | "reversed-years" | null;
  start: V2SeriesPoint | null;
  withholdingNotes: HistoryBreak[];
};

export type HistoryTrendWindow = {
  continuousRange: boolean;
  endYear: number;
  pointsByYear: Map<number, V2SeriesPoint>;
  segments: V2SeriesPoint[][];
  startYear: number;
  supportedFiveYearRange: boolean;
  unavailableReason: "break" | "gap" | null;
};

/** The curatorial scope names used by `seriesBreakNotesAt`, without importing loaders here. */
export function historySeriesKind(page: Pick<V2EntityPage, "entity_id" | "entity_type">): string | undefined {
  if (page.entity_id.startsWith("dept.") || page.entity_id.startsWith("opcat.")) {
    return "department";
  }
  return undefined;
}

export function historyBasisKey(statusClass: string, measureType: string): string {
  return `${statusClass}|${measureType}`;
}

/**
 * Builds distinct status-and-measure histories. Duplicate observations in one basis are a
 * data-contract failure, not an invitation to choose one silently.
 */
export function buildEntityHistoryModel(
  page: V2EntityPage,
  selectedYear: number,
  breaks: HistoryBreak[],
): EntityHistoryModel {
  const grouped = new Map<string, HistoryBasis>();
  for (const point of page.series) {
    const key = historyBasisKey(point.status_class, point.measure_type);
    const basis = grouped.get(key) ?? {
      key,
      statusClass: point.status_class,
      measureType: point.measure_type,
      points: [],
    };
    basis.points.push(point);
    grouped.set(key, basis);
  }

  const bases = [...grouped.values()]
    .map((basis) => ({
      ...basis,
      points: [...basis.points].sort((left, right) => left.fiscal_year - right.fiscal_year),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  for (const basis of bases) {
    const years = new Set<number>();
    for (const point of basis.points) {
      if (years.has(point.fiscal_year)) {
        throw new Error(
          `Duplicate ${basis.statusClass}/${basis.measureType} history observation for `
          + `${page.entity_id}/FY${point.fiscal_year}`,
        );
      }
      years.add(point.fiscal_year);
    }
  }

  // Prefer the selected page year's canonical basis. Sorting makes the choice deterministic
  // if the source genuinely prints more than one current basis.
  const defaultBasisKey = bases.find((basis) => (
    basis.points.some((point) => point.fiscal_year === selectedYear && point.value !== null)
  ))?.key ?? null;

  return {
    bases,
    breaks: uniqueBreaks(breaks),
    defaultBasisKey,
    selectedYear,
  };
}

export function getBasis(model: EntityHistoryModel, key: string | null): HistoryBasis | null {
  if (!key) return null;
  return model.bases.find((basis) => basis.key === key) ?? null;
}

/** The only automatic comparator: the prior fiscal year, when it is published and comparable. */
export function defaultComparisonStartYear(
  basis: HistoryBasis,
  endYear: number,
  breaks: HistoryBreak[],
): number | null {
  const previousYear = endYear - 1;
  const previous = pointForYear(basis, previousYear);
  const end = pointForYear(basis, endYear);
  if (!previous || !end || previous.value === null || end.value === null) return null;
  if (breaksBetween(breaks, previousYear, endYear).some((item) => item.blocksComparison)) return null;
  return previousYear;
}

/**
 * Calculates only an endpoint comparison the data supports. A curated comparability break
 * withholds the difference and percentage, but keeps both printed endpoint values available
 * for inspection. Missing interior years are reported; they are never imputed as zero.
 */
export function compareHistoryYears(
  basis: HistoryBasis,
  startYear: number | null,
  endYear: number | null,
  breaks: HistoryBreak[],
): HistoryComparison {
  const start = startYear === null ? null : pointForYear(basis, startYear);
  const end = endYear === null ? null : pointForYear(basis, endYear);
  if (!start || !end || start.value === null || end.value === null) {
    return emptyComparison(start, end, "missing-endpoint");
  }
  if (start.fiscal_year >= end.fiscal_year) {
    return emptyComparison(start, end, "reversed-years");
  }

  const withholdingNotes = breaksBetween(breaks, start.fiscal_year, end.fiscal_year)
    .filter((item) => item.blocksComparison);
  const gapYears = missingYearsBetween(basis, start.fiscal_year, end.fiscal_year);
  if (withholdingNotes.length > 0) {
    return {
      difference: null,
      end,
      gapYears,
      percentDifference: null,
      reason: "break",
      start,
      withholdingNotes,
    };
  }

  const difference = end.value - start.value;
  // A change from a published zero has a real dollar difference but no meaningful percent.
  const percentDifference = start.value === 0 ? null : (difference / Math.abs(start.value)) * 100;
  return {
    difference,
    end,
    gapYears,
    percentDifference,
    reason: null,
    start,
    withholdingNotes: [],
  };
}

/**
 * A one-sentence dollar-and-percent summary of a fully continuous span's two endpoints, for
 * use only where the caller has already confirmed the span is unbroken (no interior gap or
 * comparability break). `compareHistoryYears` already withholds `difference` on a break or a
 * missing endpoint, so this stays null in that case rather than guessing at a number.
 */
export function describeTrendSpanChange(
  comparison: HistoryComparison,
  startYear: number,
  endYear: number,
): string | null {
  if (comparison.difference === null) return null;
  if (comparison.difference === 0) return `No change from FY${startYear} to FY${endYear}.`;
  const direction = comparison.difference > 0 ? "Up" : "Down";
  const amountText = formatAmount(Math.abs(comparison.difference));
  const percentText = comparison.percentDifference === null
    ? ""
    : ` (${comparison.percentDifference > 0 ? "+" : ""}${comparison.percentDifference.toFixed(1)}%)`;
  return `${direction} ${amountText}${percentText} from FY${startYear} to FY${endYear}.`;
}

/**
 * The most recent five fiscal years ending at `endYear`, represented as separate segments.
 * This is intentionally a calendar window, not the last five observations: otherwise a
 * missing year would be silently hidden and the line would imply continuity.
 */
export function getRecentTrendWindow(
  basis: HistoryBasis,
  endYear: number,
  breaks: HistoryBreak[],
  startYearOverride?: number,
): HistoryTrendWindow {
  const startYear = startYearOverride ?? endYear - 4;
  const pointsByYear = new Map<number, V2SeriesPoint>();
  for (const point of basis.points) {
    if (point.fiscal_year >= startYear && point.fiscal_year <= endYear && point.value !== null) {
      pointsByYear.set(point.fiscal_year, point);
    }
  }

  const segments: V2SeriesPoint[][] = [];
  let currentSegment: V2SeriesPoint[] = [];
  for (let fiscalYear = startYear; fiscalYear <= endYear; fiscalYear++) {
    const point = pointsByYear.get(fiscalYear);
    const breaksBeforeYear = fiscalYear === startYear
      ? []
      : breaksBetween(breaks, fiscalYear - 1, fiscalYear);
    if (!point || breaksBeforeYear.length > 0) {
      if (currentSegment.length > 0) segments.push(currentSegment);
      currentSegment = point ? [point] : [];
    } else {
      currentSegment = [...currentSegment, point];
    }
  }
  if (currentSegment.length > 0) segments.push(currentSegment);

  const gapYears = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
    .filter((fiscalYear) => !pointsByYear.has(fiscalYear));
  const hasBreak = breaksBetween(breaks, startYear, endYear).length > 0;
  return {
    continuousRange: gapYears.length === 0 && !hasBreak,
    endYear,
    pointsByYear,
    segments,
    startYear,
    supportedFiveYearRange: endYear - startYear === 4 && gapYears.length === 0 && !hasBreak,
    unavailableReason: hasBreak ? "break" : gapYears.length > 0 ? "gap" : null,
  };
}

export function breaksBetween(breaks: HistoryBreak[], earlierYear: number, laterYear: number): HistoryBreak[] {
  if (earlierYear >= laterYear) return [];
  // A boundary at FY2024 splits FY2023 from FY2024, so it applies to a range that starts
  // before FY2024 and ends in FY2024 or later.
  return uniqueBreaks(breaks.filter((item) => (
    item.fiscalYear > earlierYear && item.fiscalYear <= laterYear
  )));
}

/** Converts the existing curated series-split notes into client-safe chart boundaries. */
export function historyBreaksFromNotes(notes: DataNote[]): HistoryBreak[] {
  return notes.flatMap((note) => {
    if (note.fiscal_year_start === null || note.fiscal_year_end === null) return [];
    const breaks: HistoryBreak[] = [];
    for (let fiscalYear = note.fiscal_year_start; fiscalYear <= note.fiscal_year_end; fiscalYear++) {
      breaks.push({
        blocksComparison: true,
        fiscalYear,
        headline: note.headline,
        id: `${note.note_id}:${fiscalYear}`,
        kind: "series_break",
        text: note.text,
      });
    }
    return breaks;
  });
}

/**
 * Carries forward older page metadata that v2 entity pages do not yet serialize.
 *
 * A missing interval is not a zero-filled trend, and a parent change changes the grouping
 * in which a line appears. Both are reader-visible boundaries and conservatively withhold
 * a numerical growth claim across them until the curation layer says otherwise.
 */
export function historyBreaksFromLegacy(breaks: EntityBreak[]): HistoryBreak[] {
  return breaks.map((item) => {
    if (item.kind === "gap") {
      return {
        blocksComparison: true,
        fiscalYear: item.to_fy + 1,
        headline: "This line was not published for several years",
        id: `legacy-gap-${item.from_fy}-${item.to_fy}`,
        kind: "gap",
        text: item.note,
      };
    }
    return {
      blocksComparison: true,
      fiscalYear: item.at_fy,
      headline: "Reporting group changed",
      id: `legacy-parent-change-${item.at_fy}`,
      kind: "parent_change",
      text: item.note,
    };
  });
}

function pointForYear(basis: HistoryBasis, fiscalYear: number): V2SeriesPoint | null {
  return basis.points.find((point) => point.fiscal_year === fiscalYear) ?? null;
}

function missingYearsBetween(basis: HistoryBasis, startYear: number, endYear: number): number[] {
  const published = new Set(basis.points
    .filter((point) => point.value !== null)
    .map((point) => point.fiscal_year));
  const missing: number[] = [];
  for (let fiscalYear = startYear + 1; fiscalYear < endYear; fiscalYear++) {
    if (!published.has(fiscalYear)) missing.push(fiscalYear);
  }
  return missing;
}

function uniqueBreaks(breaks: HistoryBreak[]): HistoryBreak[] {
  return [...new Map(breaks.map((item) => [item.id, item])).values()];
}

function emptyComparison(
  start: V2SeriesPoint | null,
  end: V2SeriesPoint | null,
  reason: HistoryComparison["reason"],
): HistoryComparison {
  return {
    difference: null,
    end,
    gapYears: [],
    percentDifference: null,
    reason,
    start,
    withholdingNotes: [],
  };
}
