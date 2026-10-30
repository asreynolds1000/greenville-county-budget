import type { FundCommon, FundPanelInput } from "@/lib/fundPanelData";

export type FundPanelModel = {
  entityId: string;
  common: FundCommon;
  panels: Record<number, FundPanelInput>;
};

const models = new Map<string, Promise<FundPanelModel>>();

/** One static JSON request per visited fund, only when a historical panel is selected. */
export function loadFundPanelModel(entityId: string, revision: string): Promise<FundPanelModel> {
  const key = `${entityId}:${revision}`;
  let model = models.get(key);
  if (!model) {
    model = fetch(`/e/${encodeURIComponent(entityId)}/panels.json?revision=${encodeURIComponent(revision)}`).then(async response => {
      if (!response.ok) throw new Error("Could not load the fund's historical figures.");
      const bytes = await response.arrayBuffer();
      // Web Crypto requires HTTPS or localhost; plain HTTP fails closed to the load error state.
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actualRevision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (actualRevision !== revision) throw new Error("The fund data does not match this page. Reload the page to get its current revision.");
      const result = JSON.parse(new TextDecoder().decode(bytes)) as FundPanelModel;
      if (result?.entityId !== entityId || !result.common || !result.panels) {
        throw new Error("The fund data does not match this page.");
      }
      return result;
    });
    models.set(key, model);
  }
  return model;
}

export function fundInputForYear(model: FundPanelModel, year: number): FundPanelInput {
  const input = model.panels[year];
  const kind = model.entityId === "fund.general" ? "general" : "group";
  if (!input || input.year !== year || input.kind !== kind) {
    throw new Error("The fund data does not contain the selected fiscal year.");
  }
  return input;
}

export function retryFundPanelModel(entityId: string, revision: string): void {
  models.delete(`${entityId}:${revision}`);
}
