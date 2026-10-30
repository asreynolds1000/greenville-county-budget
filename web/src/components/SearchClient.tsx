"use client";

import Link from "@/components/AppLink";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Amount } from "@/components/Amount";
import { coveredInflowClaimText, uncoveredClaimText } from "@/lib/coverageClaims";
import { getResidentEntryPoints } from "@/lib/residentEntryPoints";
import { search } from "@/lib/search";
import { getSearchGuide, getServiceContext } from "@/lib/serviceContext";
import type { SearchEntry, SearchPreview } from "@/lib/schema";

/** How long typing must pause before the URL is rewritten. */
const URL_SYNC_DELAY_MS = 350;

function statusLabel(statusClass: string): string {
  return statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
}

/**
 * The answer, in the result.
 *
 * Every observation for the chosen year is shown on its own labeled line. An entity-year
 * can carry more than one canonical status — `fin.gf.transfers-out` publishes FY2026 as
 * both an adopted amount and a signed financing line — and picking whichever sorted first
 * would present one basis as if it were the only published figure (cold review finding R3).
 *
 * A year that is the entity's latest rather than the current one says so in words. An
 * inactive historical line showing a bare figure reads as a current number, which is the
 * single thing a preview must never do.
 */
function ResultPreview({ preview }: { preview: SearchPreview }) {
  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs text-ink-secondary">
      <span className={preview.is_latest ? "text-ink-faint" : undefined}>
        {preview.is_latest ? `Latest published: FY${preview.fiscal_year}` : `FY${preview.fiscal_year}`}
      </span>
      {preview.observations.map((observation) => (
        <span key={observation.status_class} className="flex items-baseline gap-2">
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <span>{statusLabel(observation.status_class)}</span>
          <span className="tabular-nums text-ink">
            <Amount value={observation.value} printedForm={observation.printed_form} />
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * The only client component in the app.
 *
 * It receives the index as a prop rather than importing the JSON, so the server decides
 * what ships. `useSearchParams` (inside a Suspense boundary, per the page) keeps the route
 * statically exportable while still honouring a `?q=` deep link — a shared search result
 * has to survive being pasted into a message.
 */
export function SearchClient({ index, latestYear }: { index: SearchEntry[]; latestYear: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const results = useMemo(() => search(index, query), [index, query]);
  const guide = useMemo(() => getSearchGuide(query), [query]);
  const trimmed = query.trim();

  /**
   * Keep `?q=` in the address bar so a search can be copied, bookmarked, or sent to someone.
   *
   * Debounced, and `replace` rather than `push`. Writing on every keystroke would leave
   * "r", "ro", "roa", "road", "roads" in the browser's history, so Back — which a reader
   * uses to mean "return to where I came from" — would walk backwards through their own
   * typing five times before leaving the page.
   *
   * `scroll: false` because a URL update is not a navigation the reader asked for, and
   * jumping to the top of the results while they are still typing is disorienting.
   */
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (current === trimmed) return;

    const timer = setTimeout(() => {
      const next = trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname;
      router.replace(next, { scroll: false });
    }, URL_SYNC_DELAY_MS);

    return () => clearTimeout(timer);
  }, [trimmed, params, pathname, router]);

  return (
    <>
      <label htmlFor="q" className="block font-medium text-ink">
        Find a service, fund, or budget line
      </label>
      <input
        id="q"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="deputies, property tax, roads, reserves…"
        className="mt-2 w-full rounded-md border border-hairline bg-surface px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      />

      <p aria-live="polite" className="mt-3 text-sm text-ink-secondary">
        {trimmed === ""
          ? "Type a word a resident would use. Aliases are matched, so the county's own wording is not required."
          : `${results.length} ${results.length === 1 ? "budget result" : "budget results"} for “${trimmed}”`
            + (guide ? ` · ${guide.title} guide available` : "")}
      </p>

      {trimmed === "" && (
        <section className="mt-8" aria-labelledby="search-start-title">
          <h2 id="search-start-title" className="font-display text-lg font-semibold tracking-tight text-ink">Start with a service you use</h2>
          <nav aria-label="Explore resident questions" className="mt-3">
            <ul className="grid gap-x-8 text-sm sm:grid-cols-2">
              {getResidentEntryPoints(latestYear).map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="flex min-h-12 items-center justify-between border-b border-hairline text-accent hover:bg-accent/[0.03]">
                    {label}
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      )}

      {guide && (
        <section className="mt-6 rounded-lg border border-accent/40 bg-surface p-5" aria-labelledby="service-guide">
          <p className="font-mono text-xs tracking-wide text-ink-secondary uppercase">Guide · not a budget line</p>
          <h2 id="service-guide" className="mt-1 font-medium text-ink">{guide.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{guide.summary}</p>
          <p className="mt-3 text-sm">
            <Link
              href={guide.href}
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              {guide.actionLabel}
            </Link>
            <span className="text-ink-secondary"> · </span>
            <a
              href={guide.source.href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              {guide.source.label}
            </a>
            {guide.additionalSource && (
              <>
                <span className="text-ink-secondary"> · </span>
                <a
                  href={guide.additionalSource.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline decoration-dotted underline-offset-2"
                >
                  {guide.additionalSource.label}
                </a>
              </>
            )}
          </p>
        </section>
      )}

      {trimmed !== "" && results.length === 0 && (
        <div className="mt-6 rounded-lg border border-hairline bg-surface p-5">
          <p className="font-medium text-ink">Nothing here matches that.</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            This search does not guess at misspellings, because a near-miss that lands you
            on a different department is worse than no result. It also only covers what
            this site has extracted. {coveredInflowClaimText()} are here. Material not yet
            extracted includes {uncoveredClaimText()}, staffing, salaries, and millage.{" "}
            <Link
              href="/methodology/#coverage"
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              What is and is not covered
            </Link>
            .
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            &ldquo;Not covered&rdquo; always means this site has not extracted that material from
            official sources. It is never a claim that the county did not publish it.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-6 divide-y divide-hairline">
          {results.map(({ entry }) => {
            const context = entry.preview
              ? getServiceContext(entry.entity_id, entry.preview.fiscal_year)
              : undefined;

            return (
              <li key={entry.entity_id} data-testid="search-result" className="py-4">
                <Link
                  href={`/e/${entry.entity_id}/`}
                  className="font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent"
                >
                  {context?.shortLabel ?? entry.name}
                </Link>
                {context?.searchSummary && (
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
                    {context.searchSummary}
                  </p>
                )}
                <span className="mt-2 block font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                  {context ? `${entry.name} · ` : ""}
                  {entry.qualifier} · {entry.domain_label}
                  {entry.fund_label ? ` · ${entry.fund_label}` : ""}
                </span>
                {entry.preview && <ResultPreview preview={entry.preview} />}
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                  {entry.description}
                  {entry.parent_label && (
                    <span
                      data-testid="parent-category"
                      className="ml-1 font-mono text-xs text-ink-faint"
                    >
                      Under {entry.parent_label}.
                    </span>
                  )}
                  {entry.active_from_fy !== null && entry.active_to_fy !== null && (
                    <span
                      data-testid="active-year-range"
                      className="ml-1 font-mono text-xs text-ink-faint"
                    >
                      FY{entry.active_from_fy}–FY{entry.active_to_fy}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
