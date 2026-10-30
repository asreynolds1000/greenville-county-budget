import type { CoverageLevel, V2Coverage } from "@/lib/schema";

/**
 * Coverage worn as openly as provenance.
 *
 * The county overview's exit gate is that no reasonable reader could mistake General Fund
 * revenue for all county revenue. Prose cannot carry that: a sentence at the top of a page
 * is read once, and every region below it then looks equally authoritative. So each region
 * states its own coverage, from data, every time.
 *
 * Two rules this component exists to enforce.
 *
 * **Absence is a state with words, never an empty region.** `CoverageState` renders
 * something for `unavailable` — the same size and weight as the states that carry a
 * number. A region that simply omits what it lacks reads as "there is nothing here",
 * which is a different and false claim.
 *
 * **Never level by colour alone.** Every state carries a label a screen reader reads and a
 * sighted reader can distinguish without perceiving hue. The border tint is decoration on
 * top of the words, not the signal.
 */

const LEVEL_LABEL: Record<CoverageLevel, string> = {
  complete: "Covered",
  partial: "Partly covered",
  total_only: "Total only",
  unavailable: "Not covered",
};

// Tint only. The label above is what carries the meaning.
const LEVEL_TINT: Record<CoverageLevel, string> = {
  complete: "border-l-[color:var(--color-fund-general)]",
  partial: "border-l-[color:var(--color-fund-special-revenue)]",
  total_only: "border-l-[color:var(--color-fund-special-revenue)]",
  unavailable: "border-l-ink-faint",
};

export function coverageLabel(level: CoverageLevel): string {
  return LEVEL_LABEL[level];
}

/**
 * The small stamped mark, matching StatusBadge's ledger idiom.
 *
 * It links to the methodology page's coverage matrix by default, because a four-word label
 * cannot carry what "partly covered" means and a reader who wants the long version should
 * not have to go looking for where it lives. `href={null}` turns that off — used on the
 * methodology page itself, where the badge would link to the table it sits in.
 */
export function CoverageBadge({
  level,
  href = "/methodology/#coverage",
}: {
  level: CoverageLevel;
  href?: string | null;
}) {
  const className =
    "inline-flex items-center rounded-full border border-hairline bg-surface px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide text-ink-secondary uppercase";
  if (href === null) return <span className={className}>{LEVEL_LABEL[level]}</span>;
  return (
    <a href={href} data-coverage-badge="true" className={`${className} hover:text-accent`}>
      {LEVEL_LABEL[level]}
    </a>
  );
}

/**
 * One region's coverage: a title, the state, whatever figure the state supports (passed as
 * children, and legitimately nothing when the state is `unavailable`), and the note saying
 * what is and is not here.
 *
 * The note text comes from `scope_coverage.csv`, not from this file. A reader and a
 * downloaded CSV therefore get the same sentence, and changing what the site claims means
 * changing the data the pipeline validates rather than a string in a component.
 */
export function CoverageState({
  title,
  href,
  coverage,
  description,
  children,
}: {
  title: string;
  href?: string;
  coverage: V2Coverage;
  /** One plain line saying what the fund is for, shown under the name (entity.csv). */
  description?: string;
  children?: React.ReactNode;
}) {
  const heading = href ? (
    <a href={href} className="underline decoration-hairline underline-offset-4 hover:text-accent">
      {title}
    </a>
  ) : (
    title
  );

  return (
    <section
      className={`border-l-2 pl-4 ${LEVEL_TINT[coverage.coverage_level]}`}
      data-coverage-level={coverage.coverage_level}
      data-coverage-scope={coverage.scope_entity_id}
      data-coverage-domain={coverage.domain}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-ink">{heading}</p>
        <CoverageBadge level={coverage.coverage_level} />
      </div>
      {description && <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
      {coverage.gap_note && (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{coverage.gap_note}</p>
      )}
    </section>
  );
}
