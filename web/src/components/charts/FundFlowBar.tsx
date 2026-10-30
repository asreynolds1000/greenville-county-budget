import { useId } from "react";
import Link from "@/components/AppLink";
import { scaleLinear } from "d3-scale";

import { formatAmount } from "@/lib/format";
import { formatShare } from "@/lib/shares";
import type { PrintedForm } from "@/lib/schema";

/**
 * The fund-flow "wallets that sum to the whole" chart (plan Decision 5 — the
 * explicit non-Sankey choice: a single proportional bar, never a flow
 * diagram, so it can't be misread as money moving between restricted funds).
 *
 * Hand-rolled SVG per Decision 5; d3-scale's scaleLinear is used as pure
 * geometry math (raw dollar value -> bar-width units), never for DOM
 * manipulation. Segment widths are proportional to the true value/total —
 * never to the rounded, human-readable `share` field, which is display-only
 * (see shares.ts) and is used here only for the segment title/aria text.
 *
 * The bar is a chart PRIMITIVE: the Figure table remains the complete data
 * source, while each colored segment is a real link to that fund's page.
 * It is therefore an accessible SVG group, not a single `img` that would
 * flatten and hide its child links from keyboard and screen-reader users.
 */
export type FundFlowBarSegment = {
  entityId: string;
  label: string;
  value: number;
  /** Source token for zero-valued canonical segments; null for ordinary numeric values. */
  printedForm: PrintedForm | null;
  /** Hamilton-allocated display share (shares.ts) — label/table text only, not the geometry. */
  share: number;
  color: string;
  /**
   * Where this segment's own page lives, and what it is in plain language.
   *
   * `href` is used by the SVG and the Figure table; `description` is table-only. Together
   * they keep chart and table navigation aimed at the same fund-detail page.
   */
  href?: string;
  description?: string;
};

// Internal SVG coordinate space. Gap/radius are expressed in these units,
// which read as roughly "2px gap / 4px rounded ends" at a typical desktop
// card width (~700-1000px) and scale down proportionally on narrower
// viewports — an SVG viewBox can't express a literal, viewport-independent
// pixel gap while staying purely proportional. See report for this call.
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 64;
const GAP = 3;
const RADIUS = 6;

export function FundFlowBar({
  segments,
  total,
}: {
  segments: FundFlowBarSegment[];
  total: number;
}) {
  const clipId = useId();

  const totalGap = GAP * Math.max(segments.length - 1, 0);
  const usableWidth = VIEW_WIDTH - totalGap;
  const scale = scaleLinear().domain([0, total]).range([0, usableWidth]);

  // Functional prefix-sum (no outer-scope mutable accumulator during render —
  // reduce's accumulator array is freshly created and returned each call).
  const rects = segments.reduce<Array<FundFlowBarSegment & { x: number; width: number }>>(
    (acc, segment) => {
      const previous = acc[acc.length - 1];
      const x = previous ? previous.x + previous.width + GAP : 0;
      const width = scale(segment.value);
      return [...acc, { ...segment, x, width }];
    },
    [],
  );

  const ariaLabel = `Fund breakdown by adopted budget amount: ${segments
    .map((s) => `${s.label}, ${formatAmount(s.value)}, ${formatShare(s.share)} of the total`)
    .join("; ")}.`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="group"
      aria-label={ariaLabel}
      className="h-12 w-full sm:h-16"
      preserveAspectRatio="none"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} rx={RADIUS} ry={RADIUS} />
        </clipPath>
      </defs>
      {/* Clipping the whole composite to one rounded-rect (rather than rounding
          each segment) rounds only the bar's outer ends — interior seams
          between segments stay square, so the 2-unit gap reads as a hairline
          reveal of the page background, not four separate pills. */}
      <g clipPath={`url(#${clipId})`}>
        {rects.map((rect) => {
          // A single precomputed string, not several interleaved
          // text/expression children — SVG <title> hydrates unreliably
          // (server/client text-node-splitting mismatch) when its children
          // are multiple sibling JSX expressions instead of one string.
          const titleText = `${rect.label}: ${formatAmount(rect.value)} (${formatShare(rect.share)} of total)`;
          const segment = (
            <rect
              x={rect.x}
              y={0}
              width={Math.max(rect.width, 0)}
              height={VIEW_HEIGHT}
              fill={rect.color}
              className={rect.href ? "transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-80 group-focus-visible:stroke-ink group-focus-visible:stroke-[8]" : undefined}
            >
              <title>{titleText}</title>
            </rect>
          );
          if (!rect.href) return <g key={rect.entityId}>{segment}</g>;
          return (
            <Link
              key={rect.entityId}
              href={rect.href}
              aria-label={`Open ${rect.label}: ${formatAmount(rect.value)}, ${formatShare(rect.share)} of the total`}
              data-testid="fund-flow-segment-link"
              className="group cursor-pointer outline-none"
            >
              {segment}
            </Link>
          );
        })}
      </g>
    </svg>
  );
}
