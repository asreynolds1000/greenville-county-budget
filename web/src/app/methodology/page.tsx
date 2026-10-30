import type { Metadata } from "next";
import Link from "@/components/AppLink";

import { CoverageBadge, coverageLabel } from "@/components/Coverage";
import { RecencyNotice } from "@/components/RecencyNotice";
import {
  coveredInflowClaimText,
  earlyYearClaimText,
  uncoveredClaimText,
} from "@/lib/coverageClaims";
import {
  getAllDataNotes,
  getCoverage,
  getSources,
  getVerification,
  getLatestFiscalYear,
} from "@/lib/loaders";
import { taxData } from "@/lib/propertyTax";
import { OTHER_GOVERNMENT_SOURCES } from "@/lib/taxRecipients";
import type { CoverageLevel, V2Coverage } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Methodology and coverage",
  description:
    "What this site covers, where every figure comes from, how deeply each year was "
    + "verified against the printed page, and what it deliberately does not claim.",
  alternates: { canonical: "/methodology/" },
};

/**
 * The page that makes the rest of the site checkable.
 *
 * Two rules govern what is written by hand here and what is not.
 *
 * The PROSE is authored: definitions, treatment decisions, and what the site declines to
 * claim are editorial and a person should write them.
 *
 * Every NUMBER and every ROW is generated. The coverage matrix is `scope_coverage`, the
 * verification table is the source-fidelity audit parsed and cross-checked against its own
 * stated totals, the caveat glossary is the note layer, and the source list is the
 * registry. A methodology page whose figures are typed in is the first thing to go stale,
 * and it goes stale silently — nobody diffs a sentence against a dataset.
 *
 * It is also the anchor target for the whole caveat layer: every note type and coverage
 * state that renders anywhere on the site links here for the long version.
 */

const SCOPE_LABEL: Record<string, string> = {
  "budget.total": "The county's total budget",
  "fund.general": "General Fund",
  "fund.special-revenue": "Special Revenue Funds",
  "fund.debt-service": "Debt Service Fund",
  "fund.enterprise": "Enterprise Funds",
  "fund.internal-service": "Internal Service Fund",
};

const DOMAIN_LABEL = {
  inflow: "Money in",
  position: "Where it sits",
  outflow: "Money out",
} as const;

const SCOPE_ORDER = Object.keys(SCOPE_LABEL);
const DOMAINS = ["inflow", "position", "outflow"] as const;

/**
 * The matrix is a snapshot of one year, and it says which. Coverage genuinely varies by
 * year, so a matrix printed with no year on it would be a claim about all of them.
 */
const MATRIX_YEAR = getLatestFiscalYear();

function levelsFor(rows: V2Coverage[], scope: string, domain: string) {
  const forCell = rows.filter((row) => row.scope_entity_id === scope && row.domain === domain);
  const current = forCell.find((row) => row.fiscal_year === MATRIX_YEAR);
  const distinct = new Set(forCell.map((row) => row.coverage_level));
  return {
    level: (current?.coverage_level ?? "unavailable") as CoverageLevel,
    note: current?.gap_note ?? null,
    variesByYear: distinct.size > 1,
  };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-8 border-t border-hairline pt-8">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-4 grid gap-4 leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  const coverage = getCoverage();
  const verification = [...getVerification()].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const notes = [...getAllDataNotes()].sort((a, b) => a.note_id.localeCompare(b.note_id));
  const sources = [...getSources()].sort((a, b) => a.publication_order - b.publication_order);

  const sampledYears = verification.filter((year) => year.cells_sampled !== null);
  const totalCells = sampledYears.reduce((sum, year) => sum + (year.cells_sampled ?? 0), 0);
  const totalExact = sampledYears.reduce((sum, year) => sum + (year.cells_exact ?? 0), 0);
  const totalDash = sampledYears.reduce((sum, year) => sum + (year.cells_dash_as_nil ?? 0), 0);
  const totalMismatch = sampledYears.reduce((sum, year) => sum + (year.cells_mismatched ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
        Methodology and coverage
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink">
        The budget explorer transcribes Greenville County&rsquo;s own published budget
        documents and audited financial reports. It does not forecast or adjust those
        figures. The separate property-tax tool calculates estimates from published rates.
        Where the
        county&rsquo;s documents and this site disagree, the county&rsquo;s documents govern
        &mdash; and the disagreement is worth reporting, because it means something here is
        wrong.
      </p>

      <RecencyNotice />

      <Section id="scope" title="Scope of this site">
        <p>
          This site covers Greenville County&rsquo;s published budget and audited financial
          statements. It does not assess county legal or procedural questions, including
          whether a vote was lawful, notice was proper or a transfer required a
          three-quarters majority. Those questions concern applicable law and county proceedings.
        </p>
        <p>
          The finances of{" "}
          <a href={OTHER_GOVERNMENT_SOURCES.schoolsBudget.url} className="text-accent underline">Greenville County Schools</a>,{" "}
          <a href={OTHER_GOVERNMENT_SOURCES.cityBudget.url} className="text-accent underline">City of Greenville</a> and{" "}
          <a href={OTHER_GOVERNMENT_SOURCES.sanitation.url} className="text-accent underline">Greater Greenville Sanitation</a>{" "}
          are also outside this site&rsquo;s scope. These links lead to those governments&rsquo;
          official sites.
        </p>
      </Section>

      <Section id="coverage" title={`What is covered, and what is not (FY${MATRIX_YEAR})`}>
        <p>
          The county&rsquo;s published budget total combines four fund groups. This site
          covers the General Fund end to end and the other groups at the level their
          published summaries support. Every region of every page states its own coverage;
          the table below is all of those claims in one place.
        </p>
        <div
          tabIndex={0}
          role="region"
          aria-label={`Coverage by fund and domain for FY${MATRIX_YEAR}`}
          className="mt-2 overflow-x-auto focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Coverage by fund and by domain, fiscal year {MATRIX_YEAR}
            </caption>
            <thead>
              <tr className="border-b border-ink/20 text-left font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                <th scope="col" className="py-2 pr-4 font-normal">Fund</th>
                {DOMAINS.map((domain) => (
                  <th key={domain} scope="col" className="py-2 pr-4 font-normal">
                    {DOMAIN_LABEL[domain]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCOPE_ORDER.map((scope) => (
                <tr key={scope} className="border-b border-hairline align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-ink">
                    {SCOPE_LABEL[scope]}
                  </th>
                  {DOMAINS.map((domain) => {
                    const cell = levelsFor(coverage, scope, domain);
                    return (
                      <td key={domain} className="py-3 pr-4">
                        <CoverageBadge level={cell.level} href={null} />
                        {cell.variesByYear && (
                          <span className="mt-1 block font-mono text-[10px] text-ink-faint uppercase">
                            varies by year
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-secondary">
          &ldquo;{coverageLabel("unavailable")}&rdquo; always means this site has not
          extracted that material from official sources. It is never a claim that the
          county did not publish it.
        </p>
        <p className="text-sm text-ink-secondary">
          Full coverage data, all years:{" "}
          <a
            href="/downloads/v2/scope-coverage.csv"
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            scope-coverage.csv
          </a>
        </p>
      </Section>

      <Section id="verification" title="How deeply each year was checked">
        <p>
          Most checks in this project test internal consistency: totals against their
          parts, years against their neighbours, one dataset against another. All of those
          pass on a year that was transcribed wrongly but consistently. Only one check
          compares these figures to the printed page, and it is the one reported here.
        </p>
        <p>
          For each year, an agent that had not seen this data and was denied access to the
          repository was given the source PDF and a list of cells to read, and reported
          what the page said. Coverage is stratified: every department-total row in the
          audited report&rsquo;s detailed budget-and-actual schedule is read from its original-budget
          column, because no internal check reaches those source cells.
        </p>
        <p className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          <strong className="font-medium">
            {totalCells} cells across {sampledYears.length} years: {totalExact} exact,{" "}
            {totalDash} explained by the dash-as-nil convention, {totalMismatch} mismatched.
          </strong>{" "}
          FY2025 is verified differently &mdash; by two independent extractions &mdash; and
          is shown as such below. {earlyYearClaimText()}
        </p>
        <div
          tabIndex={0}
          role="region"
          aria-label="Verification depth by fiscal year"
          className="mt-2 overflow-x-auto focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Verification depth by fiscal year</caption>
            <thead>
              <tr className="border-b border-ink/20 text-left font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                <th scope="col" className="py-2 pr-4 font-normal">Year</th>
                <th scope="col" className="py-2 pr-4 font-normal">Method</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Cells read</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Exact</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Mismatched</th>
                <th scope="col" className="py-2 font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {verification.map((year) => (
                <tr key={year.fiscal_year} className="border-b border-hairline">
                  <td className="py-2.5 pr-4 font-mono">FY{year.fiscal_year}</td>
                  <td className="py-2.5 pr-4 text-ink-secondary">
                    {year.method === "dual_independent_extraction"
                      ? "Two independent extractions"
                      : "Blind re-read of a stratified sample"}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {year.cells_sampled ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {year.cells_exact ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {year.cells_mismatched ?? "—"}
                  </td>
                  <td className="py-2.5 text-ink-secondary">{year.status_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-secondary">
          <a
            href="/downloads/verification-status.csv"
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            verification-status.csv
          </a>{" "}
          &mdash; the same table as data.
        </p>
      </Section>

      <Section id="reading" title="How to read the figures">
        <p>
          <strong className="font-medium">Absent is not zero.</strong> A year with no
          published figure is shown as not published. A numeric zero is shown as $0. When
          the county printed a dash, the site uses zero for reconciled arithmetic but marks
          the displayed $0 with †. These are different facts and the site never converts an
          unpublished year into zero.
        </p>
        <p>
          <strong className="font-medium">A budget is spending authority, not money held.</strong>{" "}
          A fund&rsquo;s figure is what it is authorized to spend. Fund balance is an
          accounting position, not cash in an account, and the two are kept apart
          throughout.
        </p>
        <p>
          <strong className="font-medium">Money in and money out are labeled, never summed.</strong>{" "}
          The county publishes revenue as an estimate and appropriations as adopted. Adding
          figures of different status would produce a number the county never printed.
        </p>
        <p>
          <strong className="font-medium">Transfers between funds are shown, not netted away.</strong>{" "}
          A transfer out of one fund is money in to another. Both appear, which is why the
          fund totals cannot simply be added to a &ldquo;what the county really spends&rdquo;
          figure without double counting.
        </p>
        <p>
          <strong className="font-medium">The most recent official printing wins.</strong>{" "}
          The county reprints prior-year figures in later books, sometimes revised. Where a
          figure is cited to a book later than its own year, the citation says &ldquo;as
          printed in&rdquo; so the reader is not left thinking the citation is a mistake.
        </p>
        <p>
          <strong className="font-medium">Audited results and adopted budgets answer different questions.</strong>{" "}
          Where both exist, both are shown and labeled. The budget-versus-actual comparison
          uses the final budget as printed in the audited report, not the originally adopted
          figure, and says so on the page. The originally adopted figure is not lost: every
          year&rsquo;s{" "}
          <Link href="/downloads/" className="text-accent underline decoration-dotted underline-offset-2">
            comparison download
          </Link>{" "}
          carries both, as <code className="font-mono text-[0.9em]">original_budget</code> and{" "}
          <code className="font-mono text-[0.9em]">budget</code>, so the mid-year amendment
          is visible.
        </p>
        {notes.filter(note => note.note_id === "note.variance-interpretation").map(note => (
          <p key={note.note_id}>{note.text}</p>
        ))}
      </Section>

      <Section id="caveats" title="Every caveat this data carries">
        <p>
          Caveats are stored as data, not written into pages, so the same qualification
          reaches every figure it applies to and travels with the CSV downloads. This is all
          of them.
        </p>
        <dl className="mt-2 grid gap-4">
          {notes.map((note) => (
            <div key={note.note_id} id={`note-${note.note_id.replace(/[^a-z0-9]+/gi, "-")}`} className="scroll-mt-8">
              <dt className="font-medium text-ink">
                {note.headline}
                <span className="ml-2 font-mono text-[10px] tracking-wide text-ink-faint uppercase">
                  {note.note_type.replaceAll("_", " ")}
                  {note.fiscal_year_start !== null && (
                    <>
                      {" · FY"}
                      {note.fiscal_year_start}
                      {note.fiscal_year_end !== null && note.fiscal_year_end !== note.fiscal_year_start
                        ? `–FY${note.fiscal_year_end}`
                        : ""}
                    </>
                  )}
                </span>
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-secondary">{note.text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-ink-secondary">
          <a
            href="/downloads/data-notes.csv"
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            data-notes.csv
          </a>
        </p>
      </Section>

      <Section id="property-tax" title="Your property-tax estimate">
        <p>
          The <Link href="/property-tax/" className="text-accent underline">property-tax explorer</Link>{" "}
          uses the Auditor&rsquo;s 2025 millage sheet, covering 120 tax districts. These
          are calendar-year tax rates, separate from the fiscal-year budgets elsewhere
          on this site. The latest sheet linked on the Auditor&rsquo;s index when checked
          September 7, 2026 was 2025; this tool does not forecast a 2026 bill.
        </p>
        <p>
          A mill is $1 of tax per $1,000 of assessed value. We multiply taxable market
          value by the selected 4% or 6% assessment ratio, then apply each recipient&rsquo;s
          rate. For a qualifying 4% legal residence, Greenville school operating tax is
          removed once; school debt remains. If the resident selects an approved Homestead
          exemption, we first subtract up to $50,000 of taxable market value. Eligibility
          and exemptions are not inferred from an address.
        </p>
        <p>
          The rate sheet&rsquo;s 60.1-mill county column includes 47.3 mills for general
          county operations, 0.4 for county debt, and separate library, technical college
          and art museum levies. The result separates those recipients. Amounts are
          rounded to cents per line and added; actual billing rules, fees, other credits
          and exemptions can change the bill. Mixed 4%/6% assessments, agricultural
          valuations and special tax arrangements are outside this estimate. For
          Anderson and Spartanburg school districts, we withhold 4% estimates because
          their operating/debt split has not been verified here.
        </p>
        <p>
          Address and tax-map searches go from your browser to county GIS. After you
          choose a parcel, its PIN is sent to this site&rsquo;s server to retrieve the
          official {taxData.taxYear} county record. The site does not save the query,
          place it in the URL, or send it to analytics. Google Analytics counts page visits
          on this site but never receives an address or PIN. The county and hosting provider
          may keep their own logs. GIS returns current parcel records, so a displayed
          value or district may differ from the {taxData.taxYear} tax roll. Confirm or
          replace them using that year&rsquo;s record. Recipient amounts are calculated
          from those inputs and published rates; they are not imported notice line items
          or a record of what was actually paid or distributed.
        </p>
        <p>
          Sources: <a href="https://www.greenvillecounty.org/Auditor/Forms/millage_2025.pdf" className="text-accent underline">2025 millage sheet</a>{" "}
          (districts on pages 1–4; county and Greenville school components on page 4),{" "}
          <a href="https://www.greenvillecounty.org/RealProperty/FAQ.aspx" className="text-accent underline">Real Property FAQ</a>,{" "}
          and the <a href="https://www.greenvillecounty.org/appsas400/RealPropertyTaxEstimator/Default.aspx" className="text-accent underline">county&rsquo;s estimator</a>.
          Published rates and citations are available in the{" "}
          <a href="/downloads/property-tax/millage-2025.csv" download className="text-accent underline">millage CSV</a>.
        </p>
      </Section>

      <Section id="excluded" title="What this site does not do">
        <p>
          {earlyYearClaimText()} The older audited reports use a different fund-balance
          presentation, and department figures across FY2005 and FY2006 carry a comparability
          break because employee benefits moved into the departments.
        </p>
        <p>
          {coveredInflowClaimText()} are covered. This site does not yet cover:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{uncoveredClaimText()}</li>
          <li>detail beneath the published Special Revenue, Debt Service, and Enterprise summary statements</li>
          <li>workforce, staffing, or salaries</li>
          <li>property-tax history or actual bills</li>
          <li>figures adjusted for inflation or population</li>
        </ul>
        <p>Each missing layer needs its own extraction from official sources.</p>
        <p>
          It does not calculate a transfers-removed total. The county&rsquo;s published budget
          total keeps the transfers between its fund groups, so some money appears in more than
          one fund&rsquo;s plan. Removing them needs matching sending and receiving entries for
          the same year and the same budget basis, and simply subtracting every transfer receipt
          would also remove money arriving from funds outside the total.
        </p>
        <p>
          The consolidated fund summary on p.36 of the FY2026 book is a different scope from the
          four-group total on p.35. It prints estimated financial sources ($388,631,230)
          separately from transfers and other financing, and its columns include Capital Projects
          and Internal Service, which the published budget total does not.
        </p>
        <p>
          It does not rank, score, or evaluate what the county spends money on. It has no
          position on whether any figure here is too high or too low.
        </p>
      </Section>

      <Section id="sources" title="Every source document">
        <p>
          Budget figures cite their document and printed page. These are the budget and
          audited-report sources; the separate tax-rate sources are listed in the{" "}
          <a href="#property-tax" className="text-accent underline">property-tax methodology</a>.
        </p>
        <ul className="mt-2 grid gap-2 text-sm">
          {sources.map((source) => (
            <li key={source.source_code} className="flex flex-wrap gap-x-3">
              <span className="font-mono text-xs text-ink-secondary">{source.source_code}</span>
              <a
                href={source.official_url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 underline decoration-dotted underline-offset-2 hover:text-accent"
              >
                {source.document_title_version}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          For a short, illustrated overview of county services and the year&rsquo;s finances,
          read Greenville County&rsquo;s{" "}
          <a
            href="https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2025/pafr2025.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            FY2025 Popular Annual Financial Report
          </a>
          ; the detailed figures and accounting notes are in the ACFR.
        </p>
      </Section>

      <Section id="corrections" title="Corrections">
        <p>
          If a figure here does not match the county&rsquo;s document, the document is right
          and this site is wrong. Corrections are recorded in a public log with the date and
          what changed, and the page carrying a corrected figure says so.
        </p>
        <p>
          <Link
            href="/corrections/"
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            The corrections log and how to report an error
          </Link>
        </p>
      </Section>
    </main>
  );
}
