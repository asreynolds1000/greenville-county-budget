import { gzipSync } from "node:zlib";
import { buildFundPanelData } from "@/lib/buildFundPanelData";
import { FUND_VIEW_IDS, isFundView } from "@/lib/fundViews";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

// Build-time policy for the existing structured fund transport. Generic entities
// retain their server-rendered ledger; extending that transport is separate work.
// Avoid an async request when history adds at most 4 KiB of compressed model data.
export const INLINE_HISTORY_GZIP_BUDGET = 4 * 1024;

export function measureFundHistory(entityId: string) {
  const years = getV2CoveredFiscalYears(getV2EntityPage(entityId));
  const size = (selectedYears: number[]) => gzipSync(
    JSON.stringify(buildFundPanelData(entityId, selectedYears)), { level: 9 },
  ).length;
  const allYearsGzip = size(years);
  const latestGzip = size(years.slice(-1));
  return { allYearsGzip, latestGzip, historyGzip: allYearsGzip - latestGzip };
}

export function isDeferredFund(entityId: string): boolean {
  return isFundView(entityId) && measureFundHistory(entityId).historyGzip > INLINE_HISTORY_GZIP_BUDGET;
}

export function getDeferredFundIds(): string[] {
  return FUND_VIEW_IDS.filter(isDeferredFund);
}
