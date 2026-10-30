import { CorrectionNotice } from "@/components/CorrectionNotice";
import { EntityHistoryComparison } from "@/components/EntityHistoryComparison";
import { EntityYearExplorer, EntityYearSharedSlot } from "@/components/EntityYearExplorer";
import { FundGroupContent } from "@/components/FundGroupContent";
import { FundYearPanel } from "@/components/FundYearPanel";
import { GeneralFundServiceEntry } from "@/components/GeneralFundServiceEntry";
import { buildFundPanelData } from "@/lib/buildFundPanelData";
import { buildFundPanelModel } from "@/lib/buildFundPanelModel";
import { isDeferredFund } from "@/lib/deferredFunds";
import { displayName } from "@/lib/format";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

/** Dedicated fund routes keep their async model/renderer code off ordinary entity pages. */
export function FundExplorer({ entityId }: { entityId: string }) {
  const page = getV2EntityPage(entityId);
  const years = getV2CoveredFiscalYears(page);
  const latest = years[years.length - 1];
  const deferred = isDeferredFund(entityId);
  const fund = buildFundPanelData(entityId, deferred ? [latest] : years);
  const revision = deferred ? buildFundPanelModel(entityId).revision : "";
  return <EntityYearExplorer key={entityId} entityId={entityId} name={displayName(page)} years={years}
    panels={Object.fromEntries(years.map(year => {
      const input = fund.panels[year];
      const correction = <CorrectionNotice entityId={entityId} fiscalYear={year} />;
      // Inline group panels cost less compressed when their renderer stays on the server.
      return [year, !deferred && input?.kind === "group"
        ? <FundGroupContent key={year} input={input} common={fund.common} correction={correction}
          yearSelector={null} history={<EntityYearSharedSlot name="chart" />} />
        : <FundYearPanel key={year} entityId={entityId} year={year} revision={revision}
          input={input ?? null} common={fund.common} correction={correction}
          services={entityId === "fund.general" ? <GeneralFundServiceEntry year={year} /> : null} />];
    }))}
    shared={{ chart: <EntityHistoryComparison page={page} year={latest} />, ledger: null }} />;
}
