import { SITE_URL } from "@/lib/site";

export const CORRECTIONS_EMAIL = "a@alexreynolds.com";

type ReportErrorLinkProps = {
  pagePath: string;
  fiscalYear?: number;
  entityId?: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * A usable correction route from the page carrying the figure.
 *
 * The mail body deliberately leaves the figure and source citation for the reader to fill
 * in. Copying a possibly stale displayed amount into a report would make it harder to
 * distinguish the report from the corrected record; the stable route, fiscal year and
 * entity identifier are safe to prefill.
 */
export function ReportErrorLink({
  pagePath,
  fiscalYear,
  entityId,
  className,
  children = "Report an error",
}: ReportErrorLinkProps) {
  const details = [
    "Please check this Budget Explorer figure.",
    "",
    `Page: ${SITE_URL}${pagePath}`,
    ...(fiscalYear ? [`Fiscal year: FY${fiscalYear}`] : []),
    ...(entityId ? [`Line or fund: ${entityId}`] : []),
    "Figure or claim:",
    "County document:",
    "Printed page:",
    "What appears to be wrong:",
  ];
  const search = new URLSearchParams({
    subject: "Budget Explorer correction report",
    body: details.join("\n"),
  });

  return (
    <a href={`mailto:${CORRECTIONS_EMAIL}?${search.toString()}`} className={className}>
      {children}
    </a>
  );
}
