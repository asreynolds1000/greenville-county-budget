"use client";

import Link from "@/components/AppLink";
import { useState } from "react";
import { Amount } from "./Amount";
import { compareSpendingLine, regroupingBanner, shortenReason, type SpendingBoundary, type SpendingSnapshot } from "@/lib/budgetComparison";

export function SpendingComparison({ snapshots, boundaries }: {
  snapshots: SpendingSnapshot[]; boundaries: SpendingBoundary[];
}) {
  const latest = Math.max(...snapshots.map((s) => s.year));
  const [from, setFrom] = useState(latest - 1);
  const [to, setTo] = useState(latest);
  const [kind, setKind] = useState<"categories" | "departments">("departments");
  const [sort, setSort] = useState("amount");
  const start = snapshots.find((s) => s.year === from)!;
  const end = snapshots.find((s) => s.year === to)!;
  const ids = [...new Set([...start[kind], ...end[kind]].map((r) => r.id))];
  const rows = ids.map((id) => ({ id, ...compareSpendingLine(id, kind, snapshots, from, to, boundaries) }));
  rows.sort((a, b) => {
    const av = sort === "amount" ? a.end?.value : a.difference;
    const bv = sort === "amount" ? b.end?.value : b.difference;
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    if (av != null && bv != null && av !== bv) return sort === "decrease" ? av - bv : bv - av;
    return (a.end?.name ?? a.start?.name ?? a.id).localeCompare(b.end?.name ?? b.start?.name ?? b.id);
  });
  const sharesSupported = end.total !== null && end.detailTotal === end.total;
  const excluded = rows.filter((r) => r.difference === null).length;
  const banner = regroupingBanner(boundaries, from, to);
  const controlClass = "mt-1 block min-h-11 w-full rounded border border-hairline bg-surface px-3 py-2 text-ink focus:outline-2 focus:outline-accent";

  return <section aria-label="Compare General Fund spending" className="mt-8">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium">From fiscal year<select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={controlClass}>
        {snapshots.map((s) => <option key={s.year} value={s.year}>FY{s.year}</option>)}
      </select></label>
      <label className="text-sm font-medium">To fiscal year<select value={to} onChange={(e) => setTo(Number(e.target.value))} className={controlClass}>
        {snapshots.map((s) => <option key={s.year} value={s.year}>FY{s.year}</option>)}
      </select></label>
      <label className="text-sm font-medium">Compare<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={controlClass}>
        <option value="departments">By individual office (departments)</option><option value="categories">By broad service area (budget categories)</option>
      </select></label>
      <label className="text-sm font-medium">Order by<select value={sort} onChange={(e) => setSort(e.target.value)} className={controlClass}>
        <option value="amount">Largest end-year budget</option><option value="increase">Largest dollar increase</option><option value="decrease">Largest dollar decrease</option>
      </select></label>
    </div>
    <details className="mt-5 text-sm leading-relaxed text-ink-secondary">
      <summary className="cursor-pointer font-medium text-ink">How these categories work</summary>
      <p className="mt-3">
        {sharesSupported ? "Each share uses" : "The county reports"} the FY{to} General Fund adopted budget of <Amount value={end.total} printedForm={null} />,
        including transfers to other funds. It is not a share of all county spending.
        Changes are in the dollars of each year, without adjustment for inflation or population.
      </p>
      {!sharesSupported && <p className="mt-3 border-l-2 border-accent pl-3">
        Budget shares are withheld for FY{to}. The expenditure detail totals <Amount value={end.detailTotal} printedForm={null} />,
        which does not match the General Fund total above. These are different published presentations;
        the difference is not an unlisted service or an amount to allocate.
      </p>}
      <p className="mt-3">
        “Public Safety” is the county&apos;s category label. Sheriff is under Law Enforcement Services;
        emergency medical services may be grouped separately. Open a category to see what it includes
        in that year. The department view uses each category&apos;s direct budget lines, or the category
        itself when no further breakdown is published. Parent and child totals are not added together.
        Transfers to other funds are included among the budget categories.
      </p>
    </details>
    <p aria-live="polite" className="mt-4 text-sm font-medium">
      {rows.length} lines shown. {excluded > 0 ? `${excluded} cannot be compared across these years; their changes are withheld.` : "Every shown line has a comparable amount for the selected interval."}
    </p>
    {banner && <p className="mt-3 rounded border-l-2 border-accent bg-surface px-3 py-3 text-sm leading-relaxed" data-testid="regrouping-banner">
      {banner.message}{" "}
      <button type="button" onClick={() => setFrom(banner.start)} className="font-medium text-accent underline underline-offset-4">
        Compare FY{banner.start}–FY{to} instead
      </button>
    </p>}
    <div aria-hidden="true" className="mt-5 grid grid-cols-3 gap-3 text-xs font-medium text-ink-secondary sm:hidden">
      <span>FY{from} adopted</span><span>FY{to} adopted</span><span>Change</span>
    </div>
    <ol className="mt-2 divide-y divide-hairline border-t border-ink/30 sm:mt-5">
      {rows.map((row) => {
        const name = row.end?.name ?? row.start?.name ?? row.id;
        const share = sharesSupported && row.end?.value != null && end.total !== null && end.total > 0 ? row.end.value / end.total * 100 : null;
        const extraReason = row.reasons.length > 0 && !banner?.coveredReasons.includes(row.reasons[0]) ? shortenReason(row.reasons[0]) : null;
        return <li key={row.id} className="py-5" data-testid="spending-comparison-row">
          <h2 className="font-medium text-ink">{name}</h2>
          {kind === "departments" && rows.some((other) => other.id !== row.id && (other.end?.name ?? other.start?.name) === name) && <p className="mt-1 text-xs text-ink-secondary">
            {row.id.startsWith("opcat.") ? "Category record" : "Department record"} · {row.start?.value == null ? `First shown in this comparison in FY${to}` : row.end?.value == null ? `Shown in FY${from}; not published under this record in FY${to}` : `Shown in both selected years`}.
            Same-named records stay separate when the published grouping changes; their amounts are not joined into one growth claim.
          </p>}
          {kind === "departments" && row.id.startsWith("opcat.") && <p className="text-xs text-ink-secondary">Category budget line; no further department breakdown in this year</p>}
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
            {[{ line: row.start, year: from }, { line: row.end, year: to }].map(({ line, year }, index) => <div key={index}>
              <p className="text-ink-secondary sr-only sm:not-sr-only">FY{year} adopted</p>
              {line?.value != null ? <Link href={`/e/${row.id}/?fy=${year}`} className="font-mono text-accent underline underline-offset-4"><Amount value={line.value} printedForm={line.printedForm} /></Link> : <Amount value={null} printedForm={null} />}
              {line?.sourceUrl && <a href={line.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-ink-secondary underline">{line.sourceLabel}</a>}
            </div>)}
            <div><p className="text-ink-secondary sr-only sm:not-sr-only">Change</p>
              {row.difference === null ? <span>Not comparable</span> : <p className="font-mono">
                {row.difference > 0 ? "+" : ""}<Amount value={row.difference} printedForm={null} />
                {row.percent !== null ? ` (${row.percent > 0 ? "+" : ""}${row.percent.toFixed(1)}%)` : " (percentage unavailable from a zero or negative starting value)"}
              </p>}
            </div>
          </div>
          {share !== null && <div className="mt-3">
            <Link
              href={`/e/${row.id}/?fy=${to}`}
              data-testid="spending-share-link"
              aria-label={`Open ${name} FY${to} details. Its share is ${share.toFixed(1)}% of the General Fund budget.`}
              className="group flex min-h-11 flex-col justify-center rounded px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-xs text-ink-secondary group-hover:text-accent">{share.toFixed(1)}% of the FY{to} General Fund budget · Open FY{to} details</span>
              <span aria-hidden="true" className="mt-1 h-1.5 w-full overflow-hidden bg-hairline">
                <span className="block h-full bg-accent transition-opacity motion-reduce:transition-none group-hover:opacity-75" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
              </span>
            </Link>
          </div>}
          {extraReason && <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{extraReason}</p>}
        </li>;
      })}
    </ol>
  </section>;
}
