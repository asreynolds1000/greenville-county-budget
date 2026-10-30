import Link from "@/components/AppLink";

import { Amount } from "@/components/Amount";
import { GeneralFundShareNote } from "@/components/GeneralFundShareNote";
import { getGeneralFundShareContext } from "@/lib/generalFundShare";
import { displayName } from "@/lib/format";
import {
  getEntityPage,
  getEntitySummary,
  getSeriesPointForYear,
  isV2FiscalYearCovered,
} from "@/lib/loaders";
import { formatShare, shareOfTotal } from "@/lib/shares";
import { getServiceContext } from "@/lib/serviceContext";

const SERVICE_ENTITY_IDS = [
  "dept.emergencymedicalservices",
  "dept.sheriff",
  "dept.engineeringandroadbureaus",
];

/**
 * A few sourced destinations, not another partition or a personal-dollar allocation.
 *
 * Each destination shows its own published FY{year} amount and, where `/compare/` would show
 * one for the same fiscal year, its share of the General Fund total -- the same denominator,
 * computed the same way (shares.ts `shareOfTotal`, see generalFundShare.test.ts). A resident
 * reading the dollar figure here should never have to divide it by the fund total themselves;
 * that was the whole gap this component exists to close.
 */
export function GeneralFundServiceEntry({ year }: { year: number }) {
  const shareContext = getGeneralFundShareContext(year);

  const services = SERVICE_ENTITY_IDS.flatMap((entityId) => {
    if (!isV2FiscalYearCovered(entityId, year)) return [];
    const summary = getEntitySummary(entityId);
    const point = summary
      ? getSeriesPointForYear(getEntityPage(entityId), year)
      : null;
    // The curated, source-grounded label only exists for FY2026 (serviceContext.ts). Other
    // years still route correctly; they fall back to the entity's own resident-facing name.
    const context = getServiceContext(entityId, year);
    const label =
      context?.shortLabel ?? (summary ? displayName(summary) : entityId);
    const value = point?.value ?? null;
    const printedForm = point?.printed_form ?? null;
    const share =
      shareContext.supported && value !== null && shareContext.fundTotal
        ? shareOfTotal(value, shareContext.fundTotal)
        : null;
    return [{ entityId, label, value, printedForm, share }];
  });
  if (!services.length) return null;

  return (
    <nav
      className="mt-6 border-t border-hairline pt-4"
      aria-label={`Explore FY${year} General Fund services`}
    >
      <p className="font-medium text-ink">What services does this support?</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        These are some of the services within this fund. Open a service to see
        what its FY{year} budget covers and how its published amount has
        changed.
      </p>
      <GeneralFundShareNote context={shareContext} year={year} />
      <ul className="mt-2 divide-y divide-hairline">
        {services.map((service) => (
          <li key={service.entityId}>
            <Link
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-accent underline decoration-dotted underline-offset-4"
              href={`/e/${service.entityId}/?fy=${year}`}
              aria-label={`Explore ${service.label}, FY${year}${
                service.share !== null
                  ? `. ${formatShare(service.share)} of the FY${year} General Fund budget.`
                  : ""
              }`}
            >
              <span className="min-w-0">{service.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                {service.value !== null && (
                  <span className="font-mono text-xs tabular-nums">
                    <Amount
                      value={service.value}
                      printedForm={service.printedForm}
                    />
                  </span>
                )}
                {service.share !== null && (
                  <span className="font-mono text-xs text-ink-secondary tabular-nums">
                    {formatShare(service.share)}
                  </span>
                )}
                <span aria-hidden="true">↗</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
