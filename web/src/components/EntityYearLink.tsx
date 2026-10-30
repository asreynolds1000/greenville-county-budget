import Link from "@/components/AppLink";

import { isV2FiscalYearCovered } from "@/lib/loaders";

function unlinkedClassName(className?: string): string | undefined {
  return className?.split(" ").filter((name) => (
    name !== "underline"
    && !name.startsWith("decoration-")
    && !name.startsWith("hover:")
  )).join(" ");
}

/**
 * A same-year link only when the static export has a route for that entity and year.
 *
 * Some county summary statements name a component in years before the site has a
 * source-backed entity page for it. The amount and its own citation still belong in the
 * summary; inventing a detail route would turn a useful figure into a 404. This component
 * keeps the label readable while reserving links for pages the export actually contains.
 */
export function EntityYearLink({
  entityId,
  fiscalYear,
  className,
  children,
}: {
  entityId: string;
  fiscalYear: number;
  className?: string;
  children: React.ReactNode;
}) {
  if (!isV2FiscalYearCovered(entityId, fiscalYear)) {
    return (
      <span
        className={unlinkedClassName(className)}
        title={`No detail page is available for FY${fiscalYear}.`}
      >
        {children}
      </span>
    );
  }

  return <Link href={`/e/${entityId}/?fy=${fiscalYear}`} className={className}>{children}</Link>;
}
