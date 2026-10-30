import { getCorrections, getLatestFiscalYear, getPendingYears } from "@/lib/loaders";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/**
 * The visible boundary between the county's current adopted budget and this site's corpus.
 *
 * Every date and year comes from exported data. A hand-typed FY2027 notice would survive after
 * FY2027 ingestion and become the exact stale hedge this block exists to prevent.
 */
export function RecencyNotice({ compact = false }: { compact?: boolean }) {
  const latest = getLatestFiscalYear();
  const pending = [...getPendingYears()].sort((a, b) => a.fiscal_year - b.fiscal_year)[0];
  if (!pending) return null;
  const { data_version: dataVersion } = getCorrections();

  const content = <>
      <h2 id="recency-notice-title" className="font-display text-xl font-semibold text-ink">
        FY{pending.fiscal_year} is adopted, but not yet in this explorer
      </h2>
      <p className="mt-2 leading-relaxed text-ink-secondary">
        FY{latest} covers July {latest - 1}–June {latest}. Greenville County adopted the
        FY{pending.fiscal_year} budget on {formatDate(pending.adopted_on)}. It is not yet
        included here: {pending.reason_not_ingested.charAt(0).toLowerCase()
          + pending.reason_not_ingested.slice(1)}
      </p>
      <p className="mt-3 font-mono text-xs text-ink-faint">
        Data status checked {formatDate(pending.status_checked_on)} · Version {dataVersion}
      </p>
  </>;

  return (
    <aside
      aria-labelledby={compact ? undefined : "recency-notice-title"}
      aria-label={compact ? "Budget year coverage" : undefined}
      className={compact ? "mt-3 border-l-2 border-accent/40 pl-3 text-sm text-ink-secondary" : "mt-8 rounded-lg border border-accent/30 bg-accent/[0.04] p-5"}
      data-recency-notice="true"
    >
      {compact ? <details>
        <summary className="cursor-pointer py-2 text-xs">Newest available figures: FY{latest}. FY{pending.fiscal_year} is adopted and not yet included.</summary>
        <div className="max-w-3xl pb-3">{content}</div>
      </details> : content}
    </aside>
  );
}
