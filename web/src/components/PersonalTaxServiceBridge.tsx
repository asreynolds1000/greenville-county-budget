import Link from "@/components/AppLink";

import styles from "./PropertyTaxExplorer.module.css";

type PersonalTaxServiceBridgeProps = {
  budgetYear: number;
  taxYear: number;
};

const SERVICE_LINKS = [
  {
    label: "Emergency medical services (EMS)",
    href: (year: number) => `/e/dept.emergencymedicalservices/?fy=${year}`,
  },
  {
    label: "Sheriff and deputies",
    href: (year: number) => `/e/dept.sheriff/?fy=${year}`,
  },
  {
    label: "Roads and paving",
    href: () => "/services/roads/",
  },
] as const;

export function PersonalTaxServiceBridge({ budgetYear, taxYear }: PersonalTaxServiceBridgeProps) {
  return (
    <section className={styles.serviceBridge} aria-labelledby="personal-tax-services-title">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        Continue from your estimate
      </p>
      <h3 id="personal-tax-services-title" className="mt-2 font-display text-2xl font-semibold tracking-tight">
        What county services does this support?
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        County operations help pay for ambulances, law enforcement, road maintenance, and other
        services. Property taxes join fees, aid, transfers, and other funding in the county budget.
      </p>
      <div className={styles.serviceBridgeLinks}>
        <Link
          href={`/e/fund.general/?fy=${budgetYear}#money-out`}
          className={styles.serviceBridgePrimary}
        >
          <span className={styles.serviceBridgePrimaryLabel}>Explore FY{budgetYear} General Fund services</span>
          <span className={styles.serviceBridgePrimaryArrow} aria-hidden="true">→</span>
        </Link>
        <ul className={styles.serviceBridgeList} aria-label={`Recognizable county services in FY${budgetYear}`}>
          {SERVICE_LINKS.map((service) => (
            <li key={service.label}>
              <Link href={service.href(budgetYear)} className={styles.serviceBridgeLink}>
                <span className={styles.serviceBridgeLinkLabel}>{service.label}</span>
                <span className={styles.serviceBridgeLinkArrow} aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        This estimate uses tax year {taxYear}; the links open the latest published budget context,
        FY{budgetYear}. The county share above includes county operations and debt. The General Fund
        examples describe operations, while the roads guide covers broader separately reported road
        budgets. The other-recipient amount is collected for schools and other taxing entities; it
        is not county spending.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
        This estimate does not trace an individual&rsquo;s dollars to a department or service.
      </p>
    </section>
  );
}
