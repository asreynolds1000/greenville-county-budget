"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useEntityYear } from "@/components/EntityYearExplorer";
import { noteAppliesToYears, splitNotesByContract } from "@/components/DataNotes";

import { Amount } from "@/components/Amount";
import { HistoryFigure } from "@/components/Figure";
import {
  compareHistoryYears,
  defaultComparisonStartYear,
  getBasis,
  getRecentTrendWindow,
  type EntityHistoryModel,
  type HistoryBasis,
} from "@/lib/history";
import { formatAmount } from "@/lib/format";
import type { DataNote } from "@/lib/schema";

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const DOLLAR_BASIS_LABELS: Record<string, string> = {
  actual: "reported actuals",
  adopted: "adopted budget",
  estimated: "county estimate",
  financing: "budgeted financing",
  projected: "county projection",
  proposed: "proposed budget",
};

const DOLLAR_BASIS_OPTION_LABELS: Record<string, string> = {
  actual: "Reported actuals",
  adopted: "Adopted budget",
  estimated: "County estimates",
  financing: "Budgeted financing",
  projected: "County projections",
  proposed: "Proposed budget",
};

function basisLabel(statusClass: string, measureType: string): string {
  const statusLabel = measureType === "dollars"
    ? (DOLLAR_BASIS_LABELS[statusClass] ?? titleCase(statusClass).toLowerCase())
    : titleCase(statusClass).toLowerCase();
  if (measureType === "dollars") return statusLabel;
  return `${statusLabel} (${titleCase(measureType)})`;
}

function basisOptionLabel(statusClass: string, measureType: string): string {
  const dollarLabel = DOLLAR_BASIS_OPTION_LABELS[statusClass];
  if (measureType === "dollars" && dollarLabel) return dollarLabel;
  return `${titleCase(statusClass)} · ${titleCase(measureType)}`;
}

function basisDescription(basis: HistoryBasis, endYear: number): string {
  const point = basis.points.find((item) => item.fiscal_year === endYear && item.value !== null);
  const sourceLabel = point?.citation ? sourceDocumentLabel(point.citation.source_code) : "cited source";

  let description: string;
  switch (basis.statusClass) {
    case "actual":
      description = "Results reported by the county after the fiscal year, in its budget books or financial reports.";
      break;
    case "adopted":
      description = "The spending or funding plan approved by County Council for each fiscal year.";
      break;
    case "estimated":
      description = `The county's estimate for FY${endYear}, published in the ${sourceLabel}. It reflects expectations at that time.`;
      break;
    case "financing":
      description = "Financing figures included in the budgeted plan.";
      break;
    case "projected":
      description = `The county's estimate for FY${endYear} when it prepared the ${sourceLabel}. It reflects expectations at that time.`;
      break;
    case "proposed":
      description = "A draft budget put forward for approval.";
      break;
    default:
      description = "Figures remain grouped by the published basis shown in each source.";
  }
  return description;
}

function sourceDocumentLabel(sourceCode: string): string {
  if (/^FY\d{4}-ACFR$/.test(sourceCode)) return `${sourceCode.replace(/-ACFR$/, "")} audited financial report`;
  if (/^FY\d{4}(-\d{2})?$/.test(sourceCode)) return `${sourceCode.replace("-", "–")} budget book`;
  return sourceCode;
}

function sourceText(point: HistoryBasis["points"][number]) {
  if (!point.citation) return "No source link published";
  return `${sourceDocumentLabel(point.citation.source_code)}${point.citation.printed_page === null ? "" : `, p.${point.citation.printed_page}`}`;
}

function SourceLink({ point }: { point: HistoryBasis["points"][number] }) {
  if (!point.citation) return <span className="text-ink-faint">No source link published</span>;
  return (
    <a
      href={point.citation.source_url}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-dotted underline-offset-2 hover:text-accent"
    >
      {sourceText(point)}
    </a>
  );
}

function SelectedAmount({
  positionLabel,
  point,
  basis,
}: {
  positionLabel: string;
  point: HistoryBasis["points"][number] | null;
  basis: HistoryBasis;
}) {
  return (
    <article className="rounded-md border border-hairline bg-surface p-4">
      <p className="font-mono text-xs tracking-wide text-ink-secondary uppercase">
        {point ? `FY${point.fiscal_year} ${basisLabel(basis.statusClass, basis.measureType)}` : positionLabel}
      </p>
      {point ? (
        <>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
            <Amount value={point.value} printedForm={point.printed_form} />
          </p>
          <p className="mt-2 font-mono text-xs text-ink-secondary"><SourceLink point={point} /></p>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {basis.points.filter((item) => item.value !== null).length < 2
            ? `No earlier year is available for this ${basisLabel(basis.statusClass, basis.measureType)} figure.`
            : `Select an earlier year with a published ${basisLabel(basis.statusClass, basis.measureType)} to compare.`}
        </p>
      )}
    </article>
  );
}

function DifferenceSummary({
  basis,
  comparison,
}: {
  basis: HistoryBasis;
  comparison: ReturnType<typeof compareHistoryYears>;
}) {
  if (comparison.reason === "break") {
    return (
      <div className="mt-4 rounded-md border border-accent/30 bg-surface p-4 text-sm leading-relaxed text-ink-secondary" aria-live="polite">
        <p className="font-medium text-ink">No growth calculation is shown across this boundary.</p>
        {comparison.withholdingNotes.map((item) => (
          <p key={item.id} className="mt-2"><span className="font-medium text-ink">{item.headline}.</span> {item.text}</p>
        ))}
        <p className="mt-2">The two source-backed endpoint amounts remain above for inspection.</p>
      </div>
    );
  }
  if (comparison.reason === "missing-endpoint") {
    if (basis.points.filter((point) => point.value !== null).length < 2) return null;
    return <p className="mt-4 text-sm leading-relaxed text-ink-secondary" aria-live="polite">Choose two years with this type of figure to compare.</p>;
  }
  if (comparison.reason === "reversed-years") {
    return <p className="mt-4 text-sm leading-relaxed text-ink-secondary" aria-live="polite">Choose an earlier starting year and a later ending year.</p>;
  }
  if (comparison.difference === null) return null;

  const direction = comparison.difference > 0 ? "higher" : comparison.difference < 0 ? "lower" : "unchanged";
  return (
    <div className="mt-4 rounded-md border border-hairline bg-surface p-4" aria-live="polite">
      <p className="font-medium text-ink">
        {comparison.gapYears.length > 0
          ? `Difference between published endpoints: ${formatAmount(comparison.difference)}.`
          : `The FY${comparison.end!.fiscal_year} ${basis.statusClass} amount was ${direction}${direction === "unchanged" ? "" : ` by ${formatAmount(Math.abs(comparison.difference))}`}.`}
      </p>
      <p className="mt-1 font-mono text-sm tabular-nums text-ink-secondary">
        {comparison.percentDifference === null
          ? "Percent difference is not available because the earlier published amount is $0."
          : `${comparison.percentDifference > 0 ? "+" : ""}${comparison.percentDifference.toFixed(1)}%`}
      </p>
      {comparison.start && comparison.start.value !== null && comparison.start.value < 0 && (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          The percentage uses the absolute size of the earlier negative amount as its denominator.
        </p>
      )}
      {comparison.gapYears.length > 0 && (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          No {basis.statusClass} figure was published for {comparison.gapYears.map((year) => `FY${year}`).join(", ")}. The chart does not join across those missing years.
        </p>
      )}
    </div>
  );
}

/** Client interaction only; all filesystem-derived props arrive through the server wrapper. */
type HistoryComparisonProps = {
  entityId: string;
  model: EntityHistoryModel;
  notes: DataNote[];
  yearHrefs: Record<number, string>;
};

export function EntityHistoryComparisonClient(props: HistoryComparisonProps) {
  const selection = useEntityYear();
  const year = selection?.year ?? props.model.selectedYear;
  const model = {
    ...props.model,
    selectedYear: year,
    defaultBasisKey: props.model.bases.find((basis) =>
      basis.points.some((point) => point.fiscal_year === year && point.value !== null),
    )?.key ?? null,
  };
  return <HistoryComparisonControls key={`${props.entityId}:${year}`} {...props} model={model} />;
}

const subscribeToHydration = () => () => {};

function HistoryComparisonControls({
  entityId,
  model,
  notes,
  yearHrefs,
}: HistoryComparisonProps) {
  // Native selects accept input before React can receive it. Keep the exported HTML
  // and first hydration render inert, then enable after this component has hydrated.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  // `callout` notes belong in the chart's own frame, where a crop keeps them; `explanation`
  // notes belong in the disclosure on the entity page. Neither belongs in this always-visible
  // list, which has no year filter at all: leaving them here would print the FY2026 worked
  // example under every comparison, including FY2024, outside the disclosure that owns it.
  const { callouts: calloutNotes, footnotes: listedNotes } = splitNotesByContract(notes);
  const [basisKey, setBasisKey] = useState(model.defaultBasisKey);
  const initialBasis = getBasis(model, model.defaultBasisKey);
  const [endYear, setEndYear] = useState(model.selectedYear);
  const [startYear, setStartYear] = useState<number | null>(
    initialBasis ? defaultComparisonStartYear(initialBasis, model.selectedYear, model.breaks) : null,
  );
  const basis = getBasis(model, basisKey);
  const availableYears = useMemo(() => (
    basis?.points.filter((point) => point.value !== null).map((point) => point.fiscal_year).sort((a, b) => b - a) ?? []
  ), [basis]);
  const comparison = basis
    ? compareHistoryYears(basis, startYear, endYear, model.breaks)
    : null;
  const figureStartYear = basis && startYear !== null && startYear !== defaultComparisonStartYear(basis, endYear, model.breaks) ? startYear : undefined;
  const figureWindow = basis ? getRecentTrendWindow(basis, endYear, model.breaks, figureStartYear) : { startYear: endYear, endYear };

  if (!basis) return null;

  const chooseBasis = (key: string) => {
    const next = getBasis(model, key);
    if (!next) return;
    const nextEnd = next.points.some((point) => point.fiscal_year === model.selectedYear && point.value !== null)
      ? model.selectedYear
      : next.points.filter((point) => point.value !== null).at(-1)?.fiscal_year ?? model.selectedYear;
    setBasisKey(key);
    setEndYear(nextEnd);
    setStartYear(defaultComparisonStartYear(next, nextEnd, model.breaks));
  };

  const chooseEndYear = (nextEnd: number) => {
    setEndYear(nextEnd);
    setStartYear((current) => current !== null && current < nextEnd
      ? current
      : defaultComparisonStartYear(basis, nextEnd, model.breaks));
  };

  return (
    <section id="change-over-time" className="mt-10 border-y border-hairline py-8" aria-labelledby="change-over-time-heading">
      <div className="max-w-3xl">
        <h2 id="change-over-time-heading" className="font-display text-2xl font-semibold tracking-tight">How has it changed?</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Compare the approved plan, reported results, or the county&apos;s estimates across years. Dollar amounts are as reported at the time; they are not adjusted for inflation or population.
        </p>
      </div>

      <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${model.bases.length > 1 ? "lg:grid-cols-3" : ""}`}>
        {model.bases.length > 1 && (
          <label className="block text-sm font-medium text-ink">
            Figures to compare
            <select
              aria-describedby="comparison-basis-description"
              disabled={!hydrated}
              value={basisKey ?? ""}
              onChange={(event) => chooseBasis(event.target.value)}
              className="mt-2 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-ink focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            >
              {model.bases.map((item) => (
                <option key={item.key} value={item.key}>{basisOptionLabel(item.statusClass, item.measureType)}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-ink">
          Earlier year
          <select
            value={startYear ?? ""}
            disabled={!hydrated || !availableYears.some((item) => item < endYear)}
            onChange={(event) => setStartYear(event.target.value === "" ? null : Number(event.target.value))}
            className="mt-2 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-ink focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          >
            <option value="">{availableYears.some((item) => item < endYear) ? "Choose an earlier year" : "No earlier year available"}</option>
            {availableYears.filter((item) => item < endYear).map((item) => <option key={item} value={item}>FY{item}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Later year
          <select
            value={endYear}
            disabled={!hydrated}
            onChange={(event) => chooseEndYear(Number(event.target.value))}
            className="mt-2 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-ink focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          >
            {availableYears.map((item) => <option key={item} value={item}>FY{item}</option>)}
          </select>
        </label>
      </div>

      <p id="comparison-basis-description" className="mt-3 text-sm leading-relaxed text-ink-secondary">{basisDescription(basis, endYear)}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <SelectedAmount positionLabel="Earlier year" point={comparison?.start ?? null} basis={basis} />
        <SelectedAmount positionLabel="Later year" point={comparison?.end ?? null} basis={basis} />
      </div>

      {comparison && <DifferenceSummary basis={basis} comparison={comparison} />}
      {listedNotes.length > 0 && (
        <ul className="mt-4 space-y-2 border-l-2 border-l-accent/30 pl-3 text-sm leading-relaxed text-ink-secondary">
          {listedNotes.map((note) => (
            <li key={note.note_id}>
              <a href={`/methodology/#note-${note.note_id.replace(/[^a-z0-9]+/gi, "-")}`} className="font-medium text-accent underline decoration-dotted underline-offset-2">
                {note.headline}
              </a>{" "}
              {note.text}
            </li>
          ))}
        </ul>
      )}
      <HistoryFigure
        basis={basis}
        breaks={model.breaks}
        endYear={endYear}
        startYear={figureStartYear}
        yearHrefs={yearHrefs}
        // The same year filter the amount card applies (V2EntityYearView, noteAppliesToYear),
        // widened to the chart's window: a year-scoped callout must not show in the chart
        // while absent from the card on the same page, or the reverse.
        figureNotes={calloutNotes.filter((note) => noteAppliesToYears(note, figureWindow.startYear, figureWindow.endYear))}
        caption="Annual figures use the selected published basis. Missing years and comparability boundaries split the line rather than being estimated."
        downloadHref={`/downloads/series/${entityId}.csv`}
      />
    </section>
  );
}
