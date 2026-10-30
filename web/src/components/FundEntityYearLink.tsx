import Link from "@/components/AppLink";
import { hasFundYear, type FundCommon } from "@/lib/fundPanelData";

/** The same availability rule as EntityYearLink, using the build's covered-year list. */
export function FundEntityYearLink({ common, entityId, fiscalYear, className, children }: {
  common: FundCommon; entityId: string; fiscalYear: number;
  className?: string; children: React.ReactNode;
}) {
  if (!hasFundYear(common, entityId, fiscalYear)) {
    const unlinkedClassName = className?.split(" ").filter(name => (
      name !== "underline" && !name.startsWith("decoration-") && !name.startsWith("hover:")
    )).join(" ");
    return <span className={unlinkedClassName} title={`No detail page is available for FY${fiscalYear}.`}>{children}</span>;
  }
  return <Link href={`/e/${entityId}/?fy=${fiscalYear}`} className={className}>{children}</Link>;
}
