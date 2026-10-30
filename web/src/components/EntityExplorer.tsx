import { EntityHistoryComparison } from "@/components/EntityHistoryComparison";
import { EntityView } from "@/components/EntityView";
import { EntityYearExplorer } from "@/components/EntityYearExplorer";
import { V2EntityHistory } from "@/components/V2EntityYearView";
import { displayName } from "@/lib/format";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

/** Keep filesystem loaders and accounting renderers at build time. Only the year changes in the browser. */
export function EntityExplorer({ entityId }: { entityId: string }) {
  const page = getV2EntityPage(entityId);
  const years = getV2CoveredFiscalYears(page);
  const latest = years[years.length - 1];
  return <EntityYearExplorer key={entityId} entityId={entityId} name={displayName(page)} years={years}
    panels={Object.fromEntries(years.map((year) => [year, <EntityView key={year} entityId={entityId} year={year} />]))}
    shared={{
      chart: <EntityHistoryComparison page={page} year={latest} />,
      ledger: <V2EntityHistory page={page} />,
    }}
  />;
}
