import Link from "@/components/AppLink";
import type { DataNote } from "@/lib/schema";
import { useId } from "react";

import { Amount } from "@/components/Amount";
import { FundFlowBar, type FundFlowBarSegment } from "@/components/charts/FundFlowBar";
import { HistoryTrendChart } from "@/components/charts/HistoryTrendChart";
import { RiverChart } from "@/components/charts/RiverChart";
import { Provenance, type ProvenanceSource } from "@/components/Provenance";
import type { HistoryBasis, HistoryBreak } from "@/lib/history";
import type { RiverModel, RiverNode } from "@/lib/river";
import { describeSourceCode, formatAmount } from "@/lib/format";
import { formatShare } from "@/lib/shares";

/**
 * The Figure contract (plan Decision 4.1): the ONLY way a chart reaches a
 * page. Props require a caption, a downloadHref, and a source — there is no
 * way to construct a <Figure> that skips any of them, so a chart without a
 * table + download + source affordance is unrepresentable in the codebase.
 * eslint.config.mjs enforces the other half: the charts/ SVG primitives are
 * importable only from this file.
 *
 * The "View as table" disclosure renders a real <table> built from the SAME
 * `chart` config the SVG reads — one data source, so the two views can never
 * silently diverge (that's the point of Decision 4.1's phrasing).
 *
 * `chart` is a discriminated union so future chart kinds (history columns,
 * drilldown bars — plan Decision 5, Steps 6-7) can be added without changing
 * this contract; only "fund-flow-bar" exists as of Step 4.
 */
export type FigureChart = {
  kind: "fund-flow-bar";
  segments: FundFlowBarSegment[];
  total: number;
  /** Header for the table's row-label column, e.g. "Fund". */
  rowLabel: string;
  /** Header for the table's value column, e.g. "Amount". */
  valueLabel: string;
};

export type FigureProps = {
  caption: string;
  downloadHref: string;
  source: ProvenanceSource;
  chart: FigureChart;
  /**
   * How the accessible data table is presented.
   *
   * `disclosure` (default) keeps the original "View as table" drawer, which is right when
   * the surrounding page carries the detail itself.
   *
   * `visible` renders the table open and makes it the page's ONE representation of these
   * rows — used where the page would otherwise print a chart, a drawer table, and a third
   * linked list of the same four values (owner walkthrough, 2026-07-22). It renders each
   * segment's link and description, so consolidating loses nothing the list carried.
   *
   * Both satisfy Decision 4.1 identically: the table is built from the same `chart` config
   * the SVG reads, so the two views cannot silently diverge.
   */
  tablePresentation?: "disclosure" | "visible";
};

/** The table half of the Figure contract, identical data in both presentations. */
function FigureTable({ caption, chart }: { caption: string; chart: FigureChart }) {
  const hasDetail = chart.segments.some((segment) => segment.href || segment.description);

  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">{caption} — data table</caption>
      <thead>
        <tr className="border-b border-hairline">
          <th scope="col" className="py-2 pr-3 font-medium text-ink">
            {chart.rowLabel}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium text-ink">
            {chart.valueLabel}
          </th>
          <th scope="col" className="py-2 text-right font-medium text-ink">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {chart.segments.map((segment) => (
          <tr key={segment.entityId} className="border-b border-hairline last:border-b-0">
            {/* The fund identifies the row, so it is a row header — a screen reader then
                announces the fund before its amount instead of reading bare numbers. */}
            <th scope="row" className="py-3 pr-3 text-left font-normal align-top">
              <span className="flex items-start gap-2.5">
                {hasDetail && (
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                )}
                <span className="min-w-0">
                  {segment.href ? (
                    <Link
                      href={segment.href}
                      className="font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent"
                    >
                      {segment.label}
                    </Link>
                  ) : (
                    <span className="text-ink">{segment.label}</span>
                  )}
                  {segment.description && (
                    // Stacked under the name rather than given its own column: at 320px a
                    // fourth column forces horizontal scrolling, and the description is the
                    // field that can wrap without losing meaning.
                    <span className="mt-0.5 block text-sm font-normal text-ink-secondary">
                      {segment.description}
                    </span>
                  )}
                </span>
              </span>
            </th>
            <td className="py-3 pr-3 text-right align-top font-mono tabular-nums text-ink">
              <Amount value={segment.value} printedForm={segment.printedForm} />
            </td>
            <td className="py-3 text-right align-top font-mono tabular-nums text-ink-secondary">
              {formatShare(segment.share)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Figure({
  caption,
  downloadHref,
  source,
  chart,
  tablePresentation = "disclosure",
}: FigureProps) {
  const captionId = useId();
  const hasSegmentLinks = chart.segments.some((segment) => segment.href);

  return (
    <figure data-viz aria-labelledby={captionId} className="mt-6">
      <FundFlowBar segments={chart.segments} total={chart.total} />

      <figcaption id={captionId} className="mt-3 text-sm text-ink-secondary">
        {caption}
      </figcaption>
      {hasSegmentLinks && (
        <p className="mt-2 text-sm font-medium text-ink">
          Select a colored segment to open that fund&apos;s detail page.
        </p>
      )}

      {tablePresentation === "visible" && (
        <div className="mt-5">
          <FigureTable caption={caption} chart={chart} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {tablePresentation === "disclosure" && (
          <details className="group">
            <summary className="cursor-pointer font-medium text-accent underline decoration-dotted underline-offset-2">
              View as table
            </summary>
            <div className="mt-3 overflow-x-auto rounded-md border border-hairline">
              <div className="min-w-[420px] px-3">
                <FigureTable caption={caption} chart={chart} />
              </div>
            </div>
          </details>
        )}

        <a
          href={downloadHref}
          download
          className="font-medium text-accent underline decoration-dotted underline-offset-2"
        >
          Download data (CSV)
        </a>
      </div>

      <Provenance source={source} className="mt-3" />
    </figure>
  );
}

/** History's Figure contract: caption, source-backed annual table and CSV are mandatory. */
export function HistoryFigure({
  basis,
  breaks,
  caption,
  downloadHref,
  endYear,
  figureNotes = [],
  startYear,
  yearHrefs,
}: {
  basis: HistoryBasis;
  breaks: HistoryBreak[];
  caption: string;
  downloadHref: string;
  endYear: number;
  /** `callout` notes for this measure. Empty leaves the figure's DOM exactly as it was. */
  figureNotes?: DataNote[];
  startYear?: number;
  yearHrefs?: Record<number, string>;
}) {
  return (
    <figure data-viz className="mt-7">
      <HistoryTrendChart basis={basis} breaks={breaks} endYear={endYear} notes={figureNotes} startYear={startYear} yearHrefs={yearHrefs} />
      <figcaption className="mt-3 text-sm text-ink-secondary">{caption}</figcaption>
      <a href={downloadHref} download className="mt-3 inline-block text-sm font-medium text-accent underline decoration-dotted underline-offset-2">
        Download this series (CSV)
      </a>
    </figure>
  );
}

function RiverCitation({ node }: { node: RiverNode }) {
  const page = node.citation.printedPage !== null
    ? `p.${node.citation.printedPage}`
    : node.citation.pdfPage !== null ? `PDF p.${node.citation.pdfPage}` : "source";
  const href = node.citation.pdfPage === null
    ? node.citation.sourceUrl
    : `${node.citation.sourceUrl}#page=${node.citation.pdfPage}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-dotted underline-offset-2 hover:text-accent"
    >
      {describeSourceCode(node.citation.sourceCode)} · {page}
    </a>
  );
}

function RiverTable({
  caption,
  model,
  onSelect,
  selectedId,
}: {
  caption: string;
  model: RiverModel;
  onSelect: (node: RiverNode) => void;
  selectedId?: string;
}) {
  const roleFor = (node: RiverNode) => {
    if (node.kind === "transfer") return "Transfer";
    if (node.kind === "reserve") return "Reserve / balance";
    if (node.kind === "fund") return "Fund allocation";
    return node.kind === "revenue" ? "Source" : "Spending";
  };
  const rows: Array<{ role: string; node: RiverNode }> = [
    ...model.sources.map((node) => ({ role: roleFor(node), node })),
    ...(model.reserve ? [{ role: roleFor(model.reserve), node: model.reserve }] : []),
    ...model.uses.map((node) => ({ role: roleFor(node), node })),
  ];
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">{caption} — funding, fund total, spending, and sources</caption>
      <thead>
        <tr className="border-b border-hairline">
          <th scope="col" className="py-2 pr-3 font-medium text-ink">Role</th>
          <th scope="col" className="py-2 pr-3 font-medium text-ink">Line</th>
          <th scope="col" className="py-2 pr-3 text-right font-medium text-ink">Amount</th>
          <th scope="col" className="py-2 font-medium text-ink">Source</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-hairline bg-surface">
          <th scope="row" className="py-3 pr-3 font-normal text-ink">Authority</th>
          <td className="py-3 pr-3 font-medium text-ink">{model.centerLabel}</td>
          <td className="py-3 pr-3 text-right font-mono tabular-nums text-ink">{formatAmount(model.authority)}</td>
          <td className="py-3 font-mono text-xs text-ink-secondary">
            <a href={model.source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-accent">
              {describeSourceCode(model.source.sourceCode)}{model.source.printedPage === null ? "" : ` · p.${model.source.printedPage}`}
            </a>
          </td>
        </tr>
        {model.sources.length === 0 && (
          <tr className="border-b border-hairline">
            <th scope="row" className="py-3 pr-3 font-normal text-ink">Sources</th>
            <td colSpan={3} className="py-3 text-ink-secondary">This view does not state a consolidated county revenue total.</td>
          </tr>
        )}
        {rows.map(({ role, node }) => (
          <tr key={node.id} className="border-b border-hairline last:border-b-0">
            <th scope="row" className="py-3 pr-3 font-normal text-ink">{role}</th>
            <td className="py-3 pr-3 align-top">
              <button
                type="button"
                aria-pressed={selectedId === node.id}
                onClick={() => onSelect(node)}
                className="min-h-11 text-left font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {node.label}
              </button>
              {node.officialLabel && node.officialLabel !== node.label && <span className="mt-1 block text-xs text-ink-secondary">County budget category: {node.officialLabel}</span>}
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-secondary">{node.description}</span>
            </td>
            <td className="py-3 pr-3 text-right align-top font-mono tabular-nums text-ink">
              <Amount value={node.value} printedForm={node.printedForm} />
            </td>
            <td className="py-3 align-top font-mono text-xs text-ink-secondary"><RiverCitation node={node} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Figure-gated county budget flow. Its two ribbon sets meet at an authority spine,
 * never at each other: this preserves the visual explanation without asserting a
 * source-to-service allocation the county did not publish.
 */
export function RiverFigure({
  model,
  caption,
  downloadHref,
  onSelect,
  selectedId,
  guidedNodeIds,
}: {
  model: RiverModel;
  caption: string;
  downloadHref: string;
  onSelect: (node: RiverNode) => void;
  selectedId?: string;
  guidedNodeIds?: string[];
}) {
  const captionId = useId();
  return (
    <figure data-viz aria-labelledby={captionId} className="mt-7">
      <RiverChart model={model} onSelect={onSelect} selectedId={selectedId} guidedNodeIds={guidedNodeIds} />
      <figcaption id={captionId} className="mt-3 text-sm leading-relaxed text-ink-secondary">{caption}</figcaption>
      <Provenance source={model.source} className="mt-3" />
      <details className="mt-4 border-t border-hairline pt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent underline decoration-dotted underline-offset-2">
          View funding and spending figures and sources as a table
        </summary>
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline" tabIndex={0} role="region" aria-label="Scrollable funding and spending figures and sources table">
          <div className="p-3">
            <RiverTable caption={caption} model={model} onSelect={onSelect} selectedId={selectedId} />
          </div>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <a href={downloadHref} download className="font-medium text-accent underline decoration-dotted underline-offset-2">Download funding and spending data (CSV)</a>
      </div>
    </figure>
  );
}
