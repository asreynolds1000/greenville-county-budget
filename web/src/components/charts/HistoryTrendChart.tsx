import { Amount } from "@/components/Amount";
import { NoteCallouts } from "@/components/DataNotes";
import type { DataNote } from "@/lib/schema";
import { breaksBetween, compareHistoryYears, describeTrendSpanChange, getRecentTrendWindow, type HistoryBasis, type HistoryBreak } from "@/lib/history";
import { describeSourceCode, formatAmount } from "@/lib/format";

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 220;
const PLOT_LEFT = 22;
const PLOT_RIGHT = 16;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 30;

function sourceLabel(point: HistoryBasis["points"][number]) {
  if (!point.citation) return "No source link published";
  return `${describeSourceCode(point.citation.source_code)}${point.citation.printed_page === null ? "" : `, p.${point.citation.printed_page}`}`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
      {sourceLabel(point)}
    </a>
  );
}

/**
 * A deliberately small SVG backed by an inspectable annual table.
 *
 * The chart uses calendar positions, not the last five observations. Missing years therefore
 * remain empty, and each boundary starts a new path rather than drawing an invented line.
 */
export function HistoryTrendChart({
  basis,
  breaks,
  endYear,
  notes = [],
  startYear,
  yearHrefs,
}: {
  basis: HistoryBasis;
  breaks: HistoryBreak[];
  endYear: number;
  /**
   * `callout` notes for the measure this chart draws, rendered inside the card.
   *
   * Inside, not after: the caveat has to be in the frame a reader crops or screenshots. A
   * caption below the whole component is outside that frame and is the first thing lost.
   * Empty for every entity that has no callout, which is all of them but one, so the DOM of
   * every other chart is unchanged.
   */
  notes?: DataNote[];
  startYear?: number;
  yearHrefs?: Record<number, string>;
}) {
  const trend = getRecentTrendWindow(basis, endYear, breaks, startYear);
  const points = [...trend.pointsByYear.values()];
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max), 1);
  const plotWidth = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = VIEW_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const xFor = (year: number) => PLOT_LEFT + ((year - trend.startYear) / Math.max(trend.endYear - trend.startYear, 1)) * plotWidth;
  const yFor = (value: number) => PLOT_TOP + ((max - value) / range) * plotHeight;
  const breaksInWindow = breaksBetween(breaks, trend.startYear, trend.endYear);
  const linkedPoints = points.filter((point) => yearHrefs?.[point.fiscal_year]);
  const pointSpacingPercent = ((plotWidth / Math.max(trend.endYear - trend.startYear, 1)) / VIEW_WIDTH) * 100;
  const basisDescription = basis.statusClass === "adopted"
    ? "adopted budget"
    : `${titleCase(basis.statusClass)} ${titleCase(basis.measureType)} figure`;

  const pointTitle = (point: HistoryBasis["points"][number]) => (
    `FY${point.fiscal_year}: ${formatAmount(point.value)}${point.printed_form === "-" || point.printed_form === "--" ? " (the county printed a dash)" : ""}`
  );

  const ariaLabel = trend.supportedFiveYearRange
    ? `Five-year ${basis.statusClass} ${basis.measureType} trend from FY${trend.startYear} through FY${trend.endYear}.`
    : `Annual ${basis.statusClass} ${basis.measureType} figures from FY${trend.startYear} through FY${trend.endYear}; the line is split where publication or comparability does not support a continuous trend.`;
  const spanSentence = trend.supportedFiveYearRange
    ? describeTrendSpanChange(compareHistoryYears(basis, trend.startYear, trend.endYear, breaks), trend.startYear, trend.endYear)
    : null;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 sm:p-5">
      <div>
        <h3 className="font-medium text-ink">
          {trend.supportedFiveYearRange
            ? `Five-year trend: FY${trend.startYear}–FY${trend.endYear}`
            : `Annual figures: FY${trend.startYear}–FY${trend.endYear}`}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
          {trend.supportedFiveYearRange
            ? "One continuous line is shown because all five annual figures use this same published basis."
            : trend.continuousRange
              ? "One continuous line is shown because every year in this selected period is published on the same basis."
            : trend.unavailableReason === "break"
              ? "A continuous five-year trend is not shown because the published series changes or is interrupted in this period."
              : "A continuous five-year trend is not shown because one or more annual figures were not published."}
        </p>
        {spanSentence && (
          <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{spanSentence}</p>
        )}
        <NoteCallouts notes={notes} />
        {linkedPoints.length > 0 && (
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            Select a year on the chart to open its {basisDescription} detail page.
          </p>
        )}
      </div>

      <div className="relative mt-4 w-full max-w-[640px]">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label={ariaLabel}
          className="block h-auto w-full"
        >
        {Array.from(new Set([max, ...(min < 0 && max > 0 ? [0] : []), min])).map((value) => (
          <g key={value}>
            <line
              x1={PLOT_LEFT}
              x2={VIEW_WIDTH - PLOT_RIGHT}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke="currentColor"
              strokeDasharray={value === 0 ? "0" : "3 3"}
              className="text-hairline"
            />
            <text x={VIEW_WIDTH - PLOT_RIGHT} y={yFor(value) - 4} textAnchor="end" className="fill-ink-secondary font-mono text-[18px] sm:text-[12px]">
              {formatAmount(value)}
            </text>
          </g>
        ))}
        {trend.segments.map((segment) => (
          <polyline
            key={segment.map((point) => point.fiscal_year).join("-")}
            points={segment
              .filter((point) => point.value !== null)
              .map((point) => `${xFor(point.fiscal_year)},${yFor(point.value!)}`)
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-accent"
          />
        ))}
        {points.map((point) => (
          <circle
            key={point.fiscal_year}
            cx={xFor(point.fiscal_year)}
            cy={yFor(point.value!)}
            r="4"
            className="fill-accent stroke-surface"
            strokeWidth="2"
          >
            <title>{`FY${point.fiscal_year}: ${formatAmount(point.value)}${point.printed_form === "-" || point.printed_form === "--" ? " (the county printed a dash)" : ""}`}</title>
          </circle>
        ))}
        {Array.from({ length: Math.min(trend.endYear - trend.startYear + 1, 6) }, (_, index) => (
          trend.startYear + Math.round((index * (trend.endYear - trend.startYear)) / Math.max(Math.min(trend.endYear - trend.startYear, 5), 1))
        )).map((year) => (
          <text
            key={year}
            x={xFor(year)}
            y={VIEW_HEIGHT - 8}
            textAnchor={year === trend.startYear ? "start" : year === trend.endYear ? "end" : "middle"}
            className="fill-ink-secondary font-mono text-[18px] sm:text-[12px]"
          >
            FY{String(year).slice(-2)}
          </text>
        ))}
        </svg>
        {linkedPoints.map((point) => (
          <a
            key={point.fiscal_year}
            href={yearHrefs?.[point.fiscal_year]}
            aria-label={`Open ${basisDescription} detail page for ${pointTitle(point)}`}
            title={pointTitle(point)}
            className="absolute z-10 block h-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full hover:bg-accent/10 focus-visible:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{
              left: `${(xFor(point.fiscal_year) / VIEW_WIDTH) * 100}%`,
              top: `${(yFor(point.value!) / VIEW_HEIGHT) * 100}%`,
              width: `min(44px, ${pointSpacingPercent}%)`,
            }}
          >
            <span className="sr-only">FY{point.fiscal_year}</span>
          </a>
        ))}
      </div>

      {breaksInWindow.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-l-accent/40 pl-3 text-sm leading-relaxed text-ink-secondary">
          {breaksInWindow.map((item) => (
            <li key={item.id}>
              <span className="font-medium text-ink">FY{item.fiscalYear}: {item.headline}.</span>{" "}
              {item.text}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4 border-t border-hairline pt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent underline decoration-dotted underline-offset-2">
          Annual figures and sources in this chart
        </summary>
        <div className="mt-3 overflow-x-auto" tabIndex={0} aria-label="Annual chart figures table; scroll horizontally if needed">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Annual {basis.statusClass} {basis.measureType} figures from FY{trend.startYear} through FY{trend.endYear}
            </caption>
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                <th scope="col" className="py-2 pr-3 font-normal">Year</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Amount</th>
                <th scope="col" className="py-2 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: trend.endYear - trend.startYear + 1 }, (_, index) => trend.startYear + index).map((year) => {
                const point = trend.pointsByYear.get(year);
                return (
                  <tr key={year} className="border-b border-hairline">
                    <th scope="row" className="py-2 pr-3 text-left font-normal font-mono">
                      {point && yearHrefs?.[year] ? (
                        <a
                          href={yearHrefs[year]}
                          title={pointTitle(point)}
                          className="inline-flex min-h-11 items-center text-accent underline decoration-dotted underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          FY{year}
                        </a>
                      ) : `FY${year}`}
                    </th>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {point ? <Amount value={point.value} printedForm={point.printed_form} /> : "Not published"}
                    </td>
                    <td className="py-2 font-mono text-xs text-ink-secondary">
                      {point ? <SourceLink point={point} /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
