import Link from "@/components/AppLink";

import { getCorrections } from "@/lib/loaders";

/**
 * A notice on the page whose figure was revised.
 *
 * The corrections log alone is not enough. Somebody who cited a figure last month will
 * come back to the page, not to the log, and a page that has quietly changed underneath
 * them looks identical to one that never moved. The log is for the record; this is for
 * the reader who is standing on the affected figure right now.
 *
 * Renders nothing when the figure has not been corrected, which is almost always.
 */
export function CorrectionNotice({
  entityId,
  fiscalYear,
}: {
  entityId: string;
  fiscalYear: number;
}) {
  const { corrections } = getCorrections();
  const applicable = corrections.filter(
    (correction) => correction.scope_entity_id === entityId
      && correction.fiscal_year === String(fiscalYear),
  );
  if (applicable.length === 0) return null;

  return (
    <aside
      // A live region would be wrong (this is not an update, it is the page's own state),
      // but it must be announced as a distinct region rather than read as body prose.
      aria-labelledby={`corrections-${entityId}-${fiscalYear}`}
      className="mt-8 rounded-lg border border-hairline border-l-4 border-l-[color:var(--color-fund-debt-service)] bg-surface p-5"
    >
      <h2
        id={`corrections-${entityId}-${fiscalYear}`}
        className="font-medium text-ink"
      >
        {applicable.length === 1
          ? "A figure on this page has been corrected"
          : `${applicable.length} figures on this page have been corrected`}
      </h2>
      <ul className="mt-2 grid gap-2">
        {applicable.map((correction) => (
          <li key={correction.correction_id} className="text-sm leading-relaxed text-ink-secondary">
            <span className="font-mono text-xs text-ink">{correction.corrected_on}</span>{" "}
            — {correction.what_changed} {correction.why}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <Link
          href="/corrections/"
          className="text-accent underline decoration-dotted underline-offset-2"
        >
          The full corrections log
        </Link>
      </p>
    </aside>
  );
}
