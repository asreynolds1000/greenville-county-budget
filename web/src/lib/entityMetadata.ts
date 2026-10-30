import type { Metadata } from "next";
import { displayName } from "@/lib/format";
import { entityTitle, entityTitleName } from "@/lib/entityTitle";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

export function entityMetadata(entityId: string): Metadata {
  const page = getV2EntityPage(entityId);
  const years = getV2CoveredFiscalYears(page);
  const year = years[years.length - 1];
  return {
    // The static title names the year this page server-renders. EntityYearExplorer updates
    // document.title when the reader selects another year.
    title: entityTitle(entityTitleName(entityId, displayName(page)), year),
    // Names the item, what is measured and the years covered. No figure: a number in a search
    // snippet would travel without its status label and caveats.
    description: `${displayName(page)}: ${page.plain_language_description.replace(/\.$/, "")}. Greenville County, ${years[0] === year ? `FY${year}` : `FY${years[0]}–FY${year}`}, with each figure's source page.`,
    // Query years remain views of the one canonical entity document.
    alternates: { canonical: `/e/${entityId}/` },
  };
}
