/** Renderer families, independent of whether historical payloads need deferral. */
export const FUND_VIEW_IDS = [
  "fund.general", "fund.debt-service", "fund.special-revenue", "fund.enterprise", "fund.internal-service",
] as const;

export function isFundView(entityId: string): boolean {
  return FUND_VIEW_IDS.some(id => id === entityId);
}
