import type { Metadata } from "next";
import Link from "@/components/AppLink";

import { Amount } from "@/components/Amount";
import { getV2EntityPage } from "@/lib/loaders";
import styles from "./page.module.css";

const BUDGET_URL = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf";
const FUND_ID = "fund.sr.parks-recreation-tourism";
const SERVICES_ID = "use.sr.parks-recreation-tourism";

// Source-transcribed FY2026 detail: printed p.146 / PDF p.147. These are parts
// of the existing canonical spending line, not additional county expenditures.
const SERVICE_COSTS = [
  { label: "Staff pay and benefits", official: "Personnel Services", value: 10_607_786 },
  { label: "Operating expenses", official: "Operating Expenses", value: 5_339_862 },
  { label: "Contracted services", official: "Contractual Services", value: 1_127_500 },
  { label: "Equipment and other capital purchases", official: "Capital Outlay", value: 400_000 },
];

// Source-transcribed transfers: printed p.47 / PDF p.48.
const TRANSFERS = [
  { label: "Park and trail projects", detail: "Transferred to the Capital Projects Fund.", value: 4_550_000 },
  { label: "Recreation bond payments", detail: "Transferred to the Debt Service Fund.", value: 460_024 },
  { label: "Matching grants", detail: "The budget identifies this use without naming a recipient fund here.", value: 25_000 },
];

export const metadata: Metadata = {
  title: "How the parks figures fit together",
  description: "What Greenville County's parks budget supports and why its search results overlap.",
  alternates: { canonical: "/services/parks/" },
};

function adopted(entityId: string) {
  const point = getV2EntityPage(entityId).series.find((item) => item.fiscal_year === 2026 && item.status_class === "adopted");
  if (!point || point.value === null) throw new Error(`Missing FY2026 parks observation: ${entityId}`);
  return point.value;
}

function Source({ printedPage }: { printedPage: number }) {
  return <a href={`${BUDGET_URL}#page=${printedPage + 1}`} target="_blank" rel="noreferrer" className={styles.source}>FY2026 county budget, printed p.{printedPage}</a>;
}

export default function ParksServicePage() {
  const total = adopted(FUND_ID);
  const services = adopted(SERVICES_ID);
  const transfers = TRANSFERS.reduce((sum, item) => sum + item.value, 0);
  // Fail the export if generated totals and the cited detail cease to agree.
  if (SERVICE_COSTS.reduce((sum, item) => sum + item.value, 0) !== services || services + transfers !== total) {
    throw new Error("FY2026 parks source detail no longer reconciles to the published observations");
  }

  return (
    <main className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/search/?q=parks">Search</Link><span aria-hidden="true"> / </span>Parks and recreation</p>
      <h1>How the parks figures fit together</h1>
      <p className={styles.lead}>County parks funding supports recreation facilities, community programs, sports, trails, and park improvements. The search results show a whole fund and accounting lines within it.</p>

      <section className={styles.budget} aria-labelledby="parks-total-title">
        <p className={styles.eyebrow}>FY2026 adopted plan · Parks, Recreation and Tourism Fund</p>
        <h2 id="parks-total-title">One fund: <Amount value={total} printedForm={null} /></h2>
        <p>These two parts make up that total. Select either to see what it includes.</p>
        <div className={styles.parts}>
          <a href="#parks-services" className={styles.part}>
            <span><span className={styles.partLabel}>Services and equipment</span><strong><Amount value={services} printedForm={null} /></strong></span>
            <span aria-hidden="true">↓</span>
          </a>
          <span className={styles.plus} aria-hidden="true">+</span>
          <a href="#parks-transfers" className={styles.part}>
            <span><span className={styles.partLabel}>Transfers for projects and other uses</span><strong><Amount value={transfers} printedForm={null} /></strong></span>
            <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p>The services amount is already included in the whole fund. Adding both search results would count it twice.</p>
        <Source printedPage={145} />
      </section>

      <section id="parks-services" className={styles.section} aria-labelledby="parks-services-title">
        <p className={styles.eyebrow}>Part of the whole fund</p>
        <h2 id="parks-services-title">Services and equipment</h2>
        <p>This pays for staff, day-to-day expenses, contracted work, and capital purchases. The county describes community-center programs, recreation and sports activities, accessibility work, and upkeep of its parks and facilities.</p>
        <dl className={styles.breakdown}>
          {SERVICE_COSTS.map((item) => <div key={item.official}><dt>{item.label}<small>County label: {item.official}</small></dt><dd><Amount value={item.value} printedForm={null} /></dd></div>)}
        </dl>
        <Source printedPage={146} />
        <p className={styles.detailLink}><Link href={`/e/${SERVICES_ID}/?fy=2026`}>View the services spending line and its history →</Link></p>
      </section>

      <section id="parks-transfers" className={styles.section} aria-labelledby="parks-transfers-title">
        <p className={styles.eyebrow}>The rest of the whole fund</p>
        <h2 id="parks-transfers-title">Money moved for projects, debt, and grants</h2>
        <p>A transfer moves money to be used elsewhere in the county&apos;s accounts. It is included in the parks fund&apos;s total uses and must not be counted again as new county revenue.</p>
        <dl className={styles.breakdown}>
          {TRANSFERS.map((item) => <div key={item.label}><dt>{item.label}<small>{item.detail}</small></dt><dd><Amount value={item.value} printedForm={null} /></dd></div>)}
        </dl>
        <Source printedPage={47} />
        <p className={styles.projectNote}>The FY2026 capital plan includes park paving and sidewalks, court lighting, trail improvements, and turf at Herdklotz Park. These are budgeted projects; this page does not establish that the work is complete. <Source printedPage={175} /></p>
      </section>

      <section className={styles.section} aria-labelledby="parks-debt-title">
        <h2 id="parks-debt-title">Why the debt search result shows zero</h2>
        <p>The Debt Service summary prints a dash beside its Parks, Recreation and Tourism category. That row is not a total of parks-related debt. The summary reports bond repayments under principal and interest, and the parks fund separately budgets the <Amount value={460_024} printedForm={null} /> transfer shown above for recreation bond payments.</p>
        <p><Source printedPage={48} /><span> · </span><Source printedPage={47} /></p>
        <p className={styles.detailLink}><Link href="/e/use.debt.parks-recreation-tourism/?fy=2026">View the debt-summary category →</Link></p>
      </section>

      <section className={styles.section} aria-labelledby="parks-funding-title">
        <h2 id="parks-funding-title">Where this fund gets its money</h2>
        <p>The FY2026 plan uses property taxes, fees, money from other governments, and other receipts, plus a Hospitality Tax transfer and planned use of fund balance: money carried over from earlier years.</p>
        <Source printedPage={145} />
        <p className={styles.detailLink}><Link href={`/e/${FUND_ID}/?fy=2026`}>Explore the whole parks fund over time →</Link></p>
      </section>
    </main>
  );
}
