import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { REPO_URL, SITE_URL } from "@/lib/site";

import { comparisonGranularityText } from "@/lib/comparisonClaims";
import { displayName } from "@/lib/format";
import {
  getEntities,
  getGeneralFundComparisonSections,
  getGeneralFundComparisonYears,
  getV2Entities,
} from "@/lib/loaders";

export const metadata: Metadata = {
  title: "Download the data",
  description:
    "Every dataset behind this site as CSV: the whole-budget tree by year, every entity's "
    + "series with its sources, the caveat layer, coverage, and verification status.",
  alternates: { canonical: "/downloads/" },
};

/**
 * The downloads index.
 *
 * Every file here also has a link next to the figure it belongs to, which is where most
 * people will meet it. This page exists for the other reader: the one who wants the data
 * rather than the page, and who should not have to click through 2,600 entity pages to
 * discover what is available.
 *
 * Note what every entry says about caveats. A CSV stripped of the qualifications the site
 * renders is the most likely way a misreading gets manufactured and then attributed here,
 * so `data-notes.csv` is named as part of the dataset rather than as an extra.
 */

const FIRST_YEAR = 2002;
const LAST_YEAR = 2027;

function DownloadRow({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-b border-hairline py-4 last:border-b-0">
      <a
        href={href}
        download
        className="font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent"
      >
        {title}
      </a>
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{children}</p>
    </li>
  );
}

export default function DownloadsPage() {
  const entityCount = getV2Entities().length;
  const treeYears = LAST_YEAR - FIRST_YEAR + 1;
  const comparisonGranularity = comparisonGranularityText(getGeneralFundComparisonSections());
  const sampleEntities = getEntities()
    .filter((entity) => entity.entity_type === "department")
    .slice(0, 3);

  // schema.org Dataset, so Google Dataset Search can list the data. Describes the files and
  // their terms only; no figures.
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Greenville County, South Carolina budget data",
    description:
      `Greenville County adopted budget figures FY${FIRST_YEAR} to FY${LAST_YEAR} and General Fund audited budget-versus-actual results, transcribed from the county's budget books and Annual Comprehensive Financial Reports. Every value carries its source document, printed page and status (actual, adopted budget, proposed or projected), and caveats travel with the figures as notes.`,
    url: `${SITE_URL}/downloads/`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Person", name: "Alex Reynolds", url: "https://alexreynolds.com" },
    temporalCoverage: `${FIRST_YEAR}/${LAST_YEAR}`,
    spatialCoverage: { "@type": "Place", name: "Greenville County, South Carolina" },
    keywords: ["Greenville County", "South Carolina", "county budget", "public finance", "audited financial report"],
    sameAs: REPO_URL,
    distribution: [
      ["tree/whole-budget-" + LAST_YEAR + ".csv", "Whole-budget tree, latest year"],
      ["comparisons/general-fund-totals-budget-actual.csv", "General Fund budget versus actual totals"],
      ["data-notes.csv", "Caveats and notes"],
      ["v2/statements.csv", "Fund statements"],
      ["property-tax/millage-2025.csv", "2025 millage by tax district"],
    ].map(([path, name]) => ({ "@type": "DataDownload", name, encodingFormat: "text/csv", contentUrl: `${SITE_URL}/downloads/${path}` })),
  };

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
        Download the data
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink">
        Published budget series and property-tax rates are available as CSV with their
        source references. Budget rows carry the applicable caveat identifiers; the
        separate millage download carries its tax year, PDF pages and source fingerprint.
        Personal parcel lookups are not stored in these downloads.
      </p>
      <p className="mt-4 leading-relaxed text-ink-secondary">
        The <code className="font-mono text-sm">note_ids</code> column is the important one
        if you are going to publish anything derived from these files. Several of the
        caveats change what a number means — a department&rsquo;s figures are not comparable
        across FY2006 or across the 2013 reorganization, for instance — and a series plotted
        without them will show steps that look like spending decisions and are not. The
        text of each note is in{" "}
        <a
          href="/downloads/data-notes.csv"
          download
          className="text-accent underline decoration-dotted underline-offset-2"
        >
          data-notes.csv
        </a>
        .
      </p>
      <p className="mt-4 leading-relaxed text-ink-secondary">
        These downloads are published under the{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="text-accent underline decoration-dotted underline-offset-2">
          Creative Commons Attribution 4.0 licence (CC BY 4.0)
        </a>
        . Credit the Greenville County Budget Explorer. The full dataset, pipeline and tests are{" "}
        <a href={REPO_URL} className="text-accent underline decoration-dotted underline-offset-2">
          on GitHub
        </a>
        .
      </p>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Property-tax rates
        </h2>
        <ul className="mt-4">
          <DownloadRow href="/downloads/property-tax/millage-2025.csv" title="millage-2025.csv">
            The Auditor&rsquo;s 2025 rates for 120 districts, with county and Greenville
            school components, source pages and verification date. Rates are in mills;
            these are not tax bills or fiscal-year spending. Empty school component
            fields for Anderson and Spartanburg mean their split is not verified here.
            Read the <Link href="/methodology/#property-tax" className="text-accent underline">calculation limits</Link>{" "}
            before using them for estimates.
          </DownloadRow>
        </ul>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          The whole budget
        </h2>
        <ul className="mt-4">
          <DownloadRow href="/downloads/tree/whole-budget-2027.csv" title="whole-budget-2027.csv">
            The additive budget tree for one year: the four funds and the named special
            revenue funds, each with its parent, its status and its citation, summing to the
            county&rsquo;s reported total. One file per year, FY{FIRST_YEAR} to FY{LAST_YEAR}{" "}
            ({treeYears} files) — change the year in the filename.
          </DownloadRow>
        </ul>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          One line, every year
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
          Each of the {entityCount} lines this site tracks has its own series file: every
          year, the value, its status, and the document, printed page and PDF page it came
          from. The link is also on each line&rsquo;s own page.
        </p>
        <ul className="mt-4">
          {sampleEntities.map((entity) => (
            <DownloadRow
              key={entity.entity_id}
              href={`/downloads/series/${entity.entity_id}.csv`}
              title={`series/${entity.entity_id}.csv`}
            >
              {displayName(entity)} — {entity.plain_language_description}.
            </DownloadRow>
          ))}
        </ul>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Budget against audited result
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
          What the county planned against what its auditors reported, {comparisonGranularity},
          at the level the audited report publishes, for every audited year. The budget column
          is the final budget as printed in the audited report, not the originally adopted
          figure — that distinction is carried in the <code className="font-mono">note_ids</code>
          on every row.
        </p>
        <ul className="mt-4">
          <DownloadRow
            href="/downloads/comparisons/general-fund-fy2025-budget-actual.csv"
            title="comparisons/general-fund-fy2025-budget-actual.csv"
          >
            FY2025 category comparisons, including the original and final budget.
          </DownloadRow>
          <DownloadRow
            href="/downloads/comparisons/general-fund-totals-budget-actual.csv"
            title="comparisons/general-fund-totals-budget-actual.csv"
          >
            General Fund revenue, spending, transfers and net change for FY2011–FY2025:
            the ACFR (audited financial report) final amended budget and audited actual, with
            source pages and caveats.
          </DownloadRow>
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent underline decoration-dotted underline-offset-2">
            Download another audited year
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...getGeneralFundComparisonYears()].sort((a, b) => b - a).filter((year) => year !== 2025).map((year) => (
              <li key={year}>
                <a href={`/downloads/comparisons/general-fund-fy${year}-budget-actual.csv`} download className="inline-flex min-h-11 items-center text-sm text-accent underline decoration-dotted underline-offset-2">
                  FY{year} comparison (CSV)
                </a>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          What the figures mean, and how far they go
        </h2>
        <ul className="mt-4">
          <DownloadRow href="/downloads/data-notes.csv" title="data-notes.csv">
            The caveat layer: every qualification this site attaches to a figure, the years
            and scope it applies to, and the source that establishes it.
          </DownloadRow>
          <DownloadRow href="/downloads/v2/scope-coverage.csv" title="scope-coverage.csv">
            What is covered, per fund, per domain, per year — including, explicitly, what is
            not. Read alongside{" "}
            <Link href="/methodology/" className="text-accent underline decoration-dotted underline-offset-2">
              the methodology page
            </Link>
            .
          </DownloadRow>
          <DownloadRow href="/downloads/verification-status.csv" title="verification-status.csv">
            How deeply each fiscal year was checked against the printed page, and by which
            method.
          </DownloadRow>
          <DownloadRow href="/downloads/corrections-log.csv" title="corrections-log.csv">
            Every correction made to this data, with the date and what changed.
          </DownloadRow>
        </ul>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          The accounting model
        </h2>
        <ul className="mt-4">
          <DownloadRow href="/downloads/v2/statements.csv" title="statements.csv">
            The accounting statements this site reconciles — what each one is, which fund it
            describes, and the years it applies to.
          </DownloadRow>
          <DownloadRow href="/downloads/v2/statement-members.csv" title="statement-members.csv">
            Which lines belong to each statement, with the sign they carry in it.
          </DownloadRow>
          <DownloadRow href="/downloads/v2/statement-instances.csv" title="statement-instances.csv">
            One row per statement per year, with whether it reconciles.
          </DownloadRow>
          <DownloadRow href="/downloads/v2/relationships.csv" title="relationships.csv">
            How the lines relate: what contains what, what is a detail view of what, and
            which relationships are additive.
          </DownloadRow>
        </ul>
      </section>
    </main>
    </>
  );
}
