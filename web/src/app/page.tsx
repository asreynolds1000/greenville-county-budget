import Link from "@/components/AppLink";

import { Amount } from "@/components/Amount";
import { CountyMoneyExplorer } from "@/components/CountyMoneyExplorer";
import { CoverageState } from "@/components/Coverage";
import { RecencyNotice } from "@/components/RecencyNotice";
import { getCoverageState, getEntitySummary, getGeneralFundComparisonYears, getLatestFiscalYear } from "@/lib/loaders";
import { getResidentEntryPoints } from "@/lib/residentEntryPoints";
import { getCountyRiver, getGeneralFundRiver, getRiverYears } from "@/lib/riverData";

export default function Home() {
  const latestYear = getLatestFiscalYear();
  const actualYears = getGeneralFundComparisonYears();
  const latestActualYear = Math.max(...actualYears);
  const county = getCountyRiver(latestYear);
  const riverYears = getRiverYears();
  const years = [...new Set([...riverYears, latestYear])].sort((a, b) => a - b).map((fiscalYear) => ({
    fiscalYear,
    county: getCountyRiver(fiscalYear),
    general: getGeneralFundRiver(fiscalYear),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-16 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-secondary uppercase">Greenville County, South Carolina · Budget Explorer</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">Follow the county’s money.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-secondary">See where public money comes from, what it pays for, and how the choices have changed.</p>
        </div>
        <Link href={`/e/budget.total/?fy=${latestYear}`} className="block border-l-2 border-accent/40 pl-4 hover:border-accent" aria-label={`Open the county-published FY${latestYear} budget total and its source`}>
          <p className="font-mono text-[11px] tracking-wide text-ink-secondary uppercase">County-published FY{latestYear} budget total, including transfers between funds</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight"><Amount value={county?.authority ?? null} printedForm={null} /><span aria-hidden="true" className="ml-3 text-xl text-accent">↗</span></p>
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <Link href={`/e/fund.general/?fy=${latestYear}`} className="hidden min-h-11 items-center font-medium text-accent underline underline-offset-4 sm:inline-flex">Explore the FY{latestYear} General Fund</Link>
        <Link href="/search/" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Search the budget</Link>
        <Link href="/property-tax/" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Explore your money →</Link>
        {/* The headline now says the total includes transfers. This is the route to what that
            means, aimed at the section rather than at a note id that only exists for one year. */}
        <Link href={`/e/budget.total/?fy=${latestYear}#explanations`} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">How transfers affect this total</Link>
      </div>

      <RecencyNotice compact />
      <CountyMoneyExplorer years={years} initialYear={latestYear} actualYears={actualYears} />

      <div className="mt-10 grid gap-8 border-t border-hairline pt-8 md:grid-cols-[1fr_1fr]">
        <section aria-labelledby="your-money-title">
          <p className="font-mono text-[11px] tracking-widest text-ink-secondary uppercase">Your money</p>
          <h2 id="your-money-title" className="mt-2 font-display text-2xl font-semibold tracking-tight">How much of your tax bill stays with the county?</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">One bill can support the county, schools, a city and other taxing entities. Look up an address or tax map number to estimate the split using 2025 tax rates.</p>
          <Link href="/property-tax/" className="mt-4 inline-flex min-h-12 items-center rounded-md bg-[#164d3c] px-5 py-3 text-sm font-medium text-white hover:bg-[#103d30]">Explore your property-tax estimate →</Link>
        </section>
        <section aria-labelledby="budget-history-title">
          <p className="font-mono text-[11px] tracking-widest text-ink-secondary uppercase">Over time</p>
          <h2 id="budget-history-title" className="mt-2 font-display text-2xl font-semibold tracking-tight">What changed, and what was actually spent?</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">Compare services across years, or see the difference between the General Fund’s final budget and its audited spending.</p>
          <ul className="mt-2 text-sm text-accent underline underline-offset-4">
            <li><Link className="inline-flex min-h-11 items-center" href={`/e/budget.total/?fy=${latestYear}#change-over-time`}>How has the budget changed?</Link></li>
            <li><Link className="inline-flex min-h-11 items-center" href="/compare/">Which services grew most? →</Link></li>
            <li><Link className="inline-flex min-h-11 items-center" href={`/e/fund.general/?fy=${latestActualYear}`}>What was actually spent in FY{latestActualYear}? →</Link></li>
          </ul>
        </section>
      </div>

      <section id="money-out" className="mt-10 border-t border-hairline pt-8" aria-labelledby="service-question-title">
        <h2 id="service-question-title" className="font-display text-2xl font-semibold tracking-tight">Start with a service you use</h2>
        <nav aria-label="Explore resident questions">
          <ul className="mt-3 grid gap-x-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {getResidentEntryPoints(latestYear).map(({ label, href }) => <li key={label}><Link href={href} className="flex min-h-12 items-center justify-between border-b border-hairline text-accent hover:bg-accent/[0.03]">{label}<span aria-hidden="true">↗</span></Link></li>)}
          </ul>
        </nav>
      </section>

      <details className="mt-6 border-t border-hairline pt-5 text-sm">
        <summary className="cursor-pointer font-medium text-ink">What is included, and where are the gaps?</summary>
        <div className="mt-4 max-w-3xl space-y-4 leading-relaxed text-ink-secondary">
          <p>This page shows the General Fund’s money in and out. Each other fund has its own page. This site does not combine their funding into a countywide revenue figure.</p>
          <p>The General Fund’s beginning balance, change during the year and ending balance are on its own page. Each fund reports its own balance; this site does not combine them into a county-wide figure.</p>
          <p>The Internal Service Fund tracks departments billing each other for shared services. It stays outside the four-fund total to avoid counting that activity twice. Transfers between the four included funds are still in their gross budgets.</p>
          <p>The complete General Fund funding and spending view is available for {riverYears.map((year) => `FY${year}`).join(", ")}. Earlier years have gaps in the service-category breakdown; their available detail and history remain on the fund pages. The explorer does not yet show an audited actual-spending total for all county funds.</p>
          <div className="grid gap-4">
            {["fund.general", "fund.special-revenue", "fund.debt-service", "fund.enterprise"].map((id) => <CoverageState key={id} description={getEntitySummary(id)?.plain_language_description} title={{ "fund.general": "General Fund", "fund.special-revenue": "Special Revenue Fund", "fund.debt-service": "Debt Service Fund", "fund.enterprise": "Enterprise Fund" }[id] ?? id} href={`/e/${id}/?fy=${latestYear}`} coverage={getCoverageState(id, "outflow", latestYear)} />)}
          </div>
        </div>
      </details>
    </main>
  );
}
