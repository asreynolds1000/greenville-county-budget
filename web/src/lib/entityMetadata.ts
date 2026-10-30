import type { Metadata } from "next";
import { displayName } from "@/lib/format";
import { entityTitle } from "@/lib/entityTitle";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

export function entityMetadata(entityId: string): Metadata {
  const page = getV2EntityPage(entityId);
  const years = getV2CoveredFiscalYears(page);
  const year = years[years.length - 1];
  return {
    // The static title names the year this page server-renders. EntityYearExplorer updates
    // document.title when the reader selects another year.
    title: entityTitle(displayName(page), year),
    description: `${page.plain_language_description} — latest covered year FY${year}.`,
    // Query years remain views of the one canonical entity document.
    alternates: { canonical: `/e/${entityId}/` },
  };
}
