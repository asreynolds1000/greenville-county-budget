import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { isDeferredFund } from "./deferredFunds";
import { buildFundPanelData } from "./buildFundPanelData";

vi.mock("./buildFundPanelData", () => ({ buildFundPanelData: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("keeps a small fund inline regardless of its General Fund identity", () => {
  vi.mocked(buildFundPanelData).mockReturnValue({ common: { entities: {}, sources: {}, coveredYears: {} }, panels: {} });
  expect(isDeferredFund("fund.general")).toBe(false);
});

it("defers Internal Service when its historical model exceeds the compressed budget", () => {
  const history = randomBytes(16_384).toString("hex");
  vi.mocked(buildFundPanelData).mockImplementation((_id, years) => ({
    common: { entities: {}, sources: {}, coveredYears: {} },
    panels: Object.fromEntries(years.map(year => [year, {
      kind: "general" as const, year, yearGroups: [], pageNotes: [], dataNotes: [],
      statements: {}, comparison: null, revenuePoints: {}, overviewName: year === 2026 ? "" : history,
    }])),
  }));
  expect(isDeferredFund("fund.internal-service")).toBe(true);
});
