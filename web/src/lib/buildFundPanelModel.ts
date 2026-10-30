import { createHash } from "node:crypto";
import { buildFundPanelData } from "@/lib/buildFundPanelData";
import { getV2CoveredFiscalYears, getV2EntityPage } from "@/lib/loaders";

/** The page and static GET must identify the same exact JSON bytes. Build-time only. */
export function buildFundPanelModel(entityId: string) {
  const years = getV2CoveredFiscalYears(getV2EntityPage(entityId));
  const json = JSON.stringify({ entityId, ...buildFundPanelData(entityId, years) });
  return { json, revision: createHash("sha256").update(json).digest("hex") };
}
