import type { Metadata } from "next";
import Link from "@/components/AppLink";

import { Amount } from "@/components/Amount";
import { getV2EntityPage } from "@/lib/loaders";

const FY2026_BUDGET_URL = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf";
const FY2016_BUDGET_URL = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf";

export const metadata: Metadata = {
  title: "How road budgets relate",
  description: "A source-backed guide to Greenville County's separately reported road budgets.",
  alternates: { canonical: "/services/roads/" },
};

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-dotted underline-offset-2 hover:text-accent"
    >
      {children}
    </a>
  );
}

/** Keep headings tied to the generated, status-labelled budget observation. */
function AdoptedAmount({ entityId, fiscalYear }: { entityId: string; fiscalYear: number }) {
  const point = getV2EntityPage(entityId).series.find((candidate) => (
    candidate.fiscal_year === fiscalYear && candidate.status_class === "adopted"
  ));
  if (!point) return null;
  return <Amount value={point.value} printedForm={point.printed_form} />;
}

export default function RoadsServicePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
        How the separate road budgets relate
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-secondary">
        The county publishes more than one road-related budget. They describe different accounting
        lines and different years. This guide explains what the sources say without combining them
        into a single &ldquo;roads budget.&rdquo;
      </p>

      <section className="mt-10 border-l-2 border-l-accent pl-4" aria-labelledby="engineering-heading">
        <p className="font-mono text-xs tracking-wide text-ink-secondary uppercase">
          FY2026 General Fund department
        </p>
        <h2 id="engineering-heading" className="mt-1 font-display text-2xl font-semibold tracking-tight">
          <Link href="/e/dept.engineeringandroadbureaus/?fy=2026" className="underline decoration-hairline underline-offset-4 hover:text-accent">
            Engineering and Road Bureaus — <AdoptedAmount entityId="dept.engineeringandroadbureaus" fiscalYear={2026} />
          </Link>
        </h2>
        <p className="mt-3 leading-relaxed text-ink-secondary">
          This is the Engineering and Road Bureaus division within Public Works. Its General Fund budget
          covers road, bridge, and sign maintenance; capital improvements; pavement management; and
          subdivision-construction activity. The FY2026 book identifies Engineering plus three road
          bureaus as its sections. It describes an operating service, not the separately reported Road
          Program fund.
        </p>
        <p className="mt-3 font-mono text-xs text-ink-secondary">
          <SourceLink href={`${FY2026_BUDGET_URL}#page=85`}>FY2026 county budget, printed p.84</SourceLink>
          <span> · </span>
          <SourceLink href="https://www.greenvillecounty.org/PublicWorks/eng.aspx">County Engineering &amp; Maintenance responsibilities</SourceLink>
          <span> (current service page)</span>
        </p>
      </section>

      <section className="mt-10 border-l-2 border-l-accent pl-4" aria-labelledby="program-heading">
        <p className="font-mono text-xs tracking-wide text-ink-secondary uppercase">
          FY2026 named Special Revenue fund
        </p>
        <h2 id="program-heading" className="mt-1 font-display text-2xl font-semibold tracking-tight">
          <Link href="/e/fund.sr.road-program/?fy=2026" className="underline decoration-hairline underline-offset-4 hover:text-accent">
            Road Program — <AdoptedAmount entityId="fund.sr.road-program" fiscalYear={2026} />
          </Link>
        </h2>
        <p className="mt-3 leading-relaxed text-ink-secondary">
          This fund is budgeted from a road maintenance fee, state intergovernmental funds, and an
          Infrastructure Bank transfer. The FY2026 budget describes $33.1 million for paving, sidewalks,
          bridge replacement, road improvements, and traffic calming. Its remaining
          listed uses include transfers for road-maintenance bond debt service and public-works equipment
          replacement.
        </p>
        <p className="mt-3 leading-relaxed text-ink-secondary">
          The program description identifies funding and uses but does not explain the full year-over-year
          increase shown in the explorer. A larger budget figure does not by itself establish how many more
          miles or projects will result.
        </p>
        <p className="mt-3 font-mono text-xs text-ink-secondary">
          <SourceLink href={`${FY2026_BUDGET_URL}#page=151`}>FY2026 county budget, printed p.150</SourceLink>
        </p>
      </section>

      <section className="mt-10 border-l-2 border-l-hairline pl-4" aria-labelledby="paving-heading">
        <p className="font-mono text-xs tracking-wide text-ink-secondary uppercase">
          Historical named Special Revenue fund · latest published here: FY2015
        </p>
        <h2 id="paving-heading" className="mt-1 font-display text-2xl font-semibold tracking-tight">
          <Link href="/e/fund.sr.road-paving/?fy=2015" className="underline decoration-hairline underline-offset-4 hover:text-accent">
            Road Paving — <AdoptedAmount entityId="fund.sr.road-paving" fiscalYear={2015} />
          </Link>
        </h2>
        <p className="mt-3 leading-relaxed text-ink-secondary">
          This is a FY2015 amount for a historical fund, not a current FY2026 budget. The county sources
          reviewed for this guide do not verify that Road Paving was renamed, replaced, or reconciles to
          the current Road Program. Its relationship to the FY2026 figures is therefore unknown, and the
          amounts must not be added together.
        </p>
        <p className="mt-3 font-mono text-xs text-ink-secondary">
          <SourceLink href={`${FY2016_BUDGET_URL}#page=37`}>FY2016–17 county budget, printed p.37</SourceLink>
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-hairline bg-surface p-5" aria-labelledby="not-total-heading">
        <h2 id="not-total-heading" className="font-medium text-ink">Why these figures are not added</h2>
        <p className="mt-2 leading-relaxed text-ink-secondary">
          The FY2026 sources identify a General Fund department and a named Special Revenue fund, each
          with road-related work. They do not publish a reconciliation showing whether their activities
          overlap or a formula that produces one combined service total. The FY2015 Road Paving figure is
          both historical and unreconciled. Showing the lines separately preserves the county&rsquo;s accounting
          context and avoids a total the sources do not support.
        </p>
      </section>
    </main>
  );
}
