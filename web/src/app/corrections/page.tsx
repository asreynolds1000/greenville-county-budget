import type { Metadata } from "next";
import Link from "@/components/AppLink";

import { ReportErrorLink } from "@/components/ReportErrorLink";
import { getCorrections, isV2FiscalYearCovered } from "@/lib/loaders";
import { entityYearHref } from "@/lib/entityYearSelection";

export const metadata: Metadata = {
  title: "Corrections",
  description:
    "How to report an error in this data, what happens when the county disputes a figure, "
    + "and every correction made so far.",
  alternates: { canonical: "/corrections/" },
};

/**
 * Corrections as a designed surface, not a bullet on an about page (cold-review R6).
 *
 * A site that transcribes someone else's documents will get something wrong. What
 * separates a trustworthy one from an untrustworthy one is not the absence of errors, it
 * is whether a reader can find out that an error happened, when, and to which figure.
 *
 * An empty log is not an embarrassment and is not hidden. It is the honest current state,
 * and publishing it from day one is what makes a non-empty log later read as the process
 * working rather than as a site quietly patching itself.
 */

export default function CorrectionsPage() {
  const { data_version: dataVersion, corrections } = getCorrections();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
        Corrections
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink">
        Every figure on this site is transcribed from a county document, and the document
        governs. If a number here does not match the source it cites, the number here is
        wrong and will be corrected.
      </p>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Reporting an error
        </h2>
        <p className="mt-4 leading-relaxed text-ink">
          The most useful report names the page, the figure, and the county document and
          printed page you checked it against. Every figure on this site carries its
          citation, so all three are on screen next to the number.
        </p>
        <p className="mt-4 leading-relaxed text-ink-secondary">
          A report does not need to be that complete to be worth sending. &ldquo;This looks
          wrong&rdquo; on a specific figure is enough to start.
        </p>
        <p className="mt-5">
          <ReportErrorLink
            pagePath="/corrections/"
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:border-ink/30 hover:bg-surface"
          >
            Report an error by email
          </ReportErrorLink>
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          What happens when the county disputes a figure
        </h2>
        <p className="mt-4 leading-relaxed text-ink">
          If the county says a figure here misreads its document, the figure is checked
          against the document. If this site read it wrong, it is corrected and logged.
        </p>
        <p className="mt-4 leading-relaxed text-ink">
          If the reading holds and the disagreement is about what the document means, both
          positions are published side by side and cited. This site does not adjudicate a
          dispute about its own source material, and it does not quietly remove a figure
          because the disagreement is uncomfortable.
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          The log
        </h2>
        {corrections.length === 0 ? (
          <p className="mt-4 leading-relaxed text-ink-secondary">
            No corrections have been made. This log is published empty rather than hidden
            until it has something in it, so that its first entry reads as this process
            working rather than as a page appearing after the fact.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" tabIndex={0} role="region" aria-label="Corrections table; scroll horizontally if needed">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Every correction made to this data</caption>
              <thead>
                <tr className="border-b border-ink/20 text-left font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                  <th scope="col" className="py-2 pr-4 font-normal">Date</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Figure</th>
                  <th scope="col" className="py-2 pr-4 font-normal">What changed</th>
                  <th scope="col" className="py-2 font-normal">Why</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((correction) => (
                  <tr key={correction.correction_id} className="border-b border-hairline align-top">
                    <td className="py-2.5 pr-4 font-mono whitespace-nowrap">
                      {correction.corrected_on}
                    </td>
                    <td className="py-2.5 pr-4">
                      {correction.scope_entity_id ? (
                        <Link
                          href={/^\d{4}$/.test(correction.fiscal_year)
                            && isV2FiscalYearCovered(correction.scope_entity_id, Number(correction.fiscal_year))
                            ? entityYearHref(correction.scope_entity_id, Number(correction.fiscal_year))
                            : `/e/${encodeURIComponent(correction.scope_entity_id)}/`}
                          className="underline decoration-dotted underline-offset-2 hover:text-accent"
                        >
                          {correction.scope_entity_id}{correction.fiscal_year ? ` FY${correction.fiscal_year}` : ""}
                        </Link>
                      ) : (
                        "Multiple pages"
                      )}
                    </td>
                    <td className="py-2.5 pr-4">{correction.what_changed}</td>
                    <td className="py-2.5 text-ink-secondary">{correction.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-sm text-ink-secondary">
          <a
            href="/downloads/corrections-log.csv"
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            corrections-log.csv
          </a>
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Citing a figure from this site
        </h2>
        <p className="mt-4 leading-relaxed text-ink">
          Cite the county&rsquo;s document, which every figure here names. If you need to
          cite this site &mdash; for a transcription, a total it computed, or a caveat it
          carries &mdash; include the data version below. It is a hash of the published
          data, so it changes when a figure changes and not when the site is merely rebuilt.
        </p>
        <p className="mt-4 font-mono text-sm text-ink">
          Data version <span className="font-medium">{dataVersion}</span>
        </p>
      </section>
    </main>
  );
}
