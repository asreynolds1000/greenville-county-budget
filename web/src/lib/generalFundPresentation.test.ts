import { describe, expect, it } from "vitest";

import {
  auditedBudgetActualRows,
  canRenderResultStories,
  reconcileBudgetBookToActualEnding,
} from "@/components/GeneralFundCycleContent";
import { getGeneralFundBudgetActualComparison } from "./loaders";

describe("General Fund final-amended-budget presentation", () => {
  it.each([
    [2011, 125_420_953, 126_719_519, 7_248_480, -5_913_769, 0, 42, 28],
    [2014, 133_894_751, 138_810_832, 6_565_294, -1_385_077, 264_136, 39, 31],
    [2018, 157_555_547, 162_135_054, 9_600_000, -6_601_921, -1_581_428, 37, 33],
    [2025, 223_764_269, 241_649_556, 15_250_093, -9_782_907, -12_418_101, 102, 85],
  ])(
    "uses FY%s ACFR final budget totals and their budget-and-actual statement source",
    (year, revenue, expenditures, transfersIn, transfersOut, netChange, pdfPage, printedPage) => {
      const comparison = getGeneralFundBudgetActualComparison(year)!;
      expect(comparison.totals.total_revenues.budget).toBe(revenue);
      expect(comparison.totals.total_expenditures.budget).toBe(expenditures);
      expect(comparison.totals.transfers_in.budget).toBe(transfersIn);
      expect(comparison.totals.transfers_out.budget).toBe(transfersOut);
      expect(comparison.totals.net_change.budget).toBe(netChange);
      expect(comparison.totals.net_change).toMatchObject({ pdf_page: pdfPage, printed_page: printedPage });
      if (year === 2011) expect(comparison.totals.net_change.budget_printed_form).toBe("-");
    },
  );

  it("keeps signed ACFR transfers out while residents see money leaving as a positive amount", () => {
    const rows = auditedBudgetActualRows(getGeneralFundBudgetActualComparison(2011)!);
    expect(rows.moneyIn).toEqual([
      expect.objectContaining({ label: "Revenue", budget: 125_420_953, actual: 122_379_292 }),
      expect.objectContaining({ label: "Transfers in", budget: 7_248_480, actual: 7_271_191 }),
      expect.objectContaining({ label: "Total money in", budget: 132_669_433, actual: 129_650_483 }),
    ]);
    expect(rows.moneyOut).toEqual([
      expect.objectContaining({ label: "Operating spending", budget: 126_719_519, actual: 123_617_673 }),
      expect.objectContaining({ label: "Transfers out", budget: 5_913_769, actual: 5_088_962 }),
      expect.objectContaining({ label: "Total money out", budget: 132_633_288, actual: 128_706_635 }),
    ]);
    expect(rows).toMatchObject({ finalBudgetNetChange: 0, actualNetChange: 943_848 });
  });

  it.each([2011, 2014, 2018, 2025])("keeps each year's category detail on the same final-budget basis", (year) => {
    const comparison = getGeneralFundBudgetActualComparison(year)!;
    const sum = (rows: typeof comparison.revenue_categories) => rows.reduce(
      (totals, row) => ({ budget: totals.budget + row.budget, actual: totals.actual + row.actual }),
      { budget: 0, actual: 0 },
    );
    expect(sum(comparison.revenue_categories)).toEqual({
      budget: comparison.totals.total_revenues.budget,
      actual: comparison.totals.total_revenues.actual,
    });
    expect(sum(comparison.spending_categories)).toEqual({
      budget: comparison.totals.total_expenditures.budget,
      actual: comparison.totals.total_expenditures.actual,
    });
  });

  it("includes the FY2011 GAAP bridge in the independent budget-book ending-balance equation", () => {
    expect(reconcileBudgetBookToActualEnding({
      plannedBeginning: 48_071_989,
      plannedChange: 6_037,
      plannedAdjustment: null,
      plannedEnding: 48_078_026,
      actualBeginning: 49_182_443,
      actualChange: 943_848,
      actualAdjustment: 309_372,
      actualEnding: 50_435_663,
    })).toMatchObject({
      startRevision: 1_110_454,
      resultRevision: 937_811,
      planAdjustment: 0,
      auditAdjustment: 309_372,
      ending: 50_435_663,
    });
  });

  it("subtracts FY2022's signed budget-book position adjustment before adding the audited bridge", () => {
    expect(reconcileBudgetBookToActualEnding({
      plannedBeginning: 47_298_238,
      plannedChange: -5_548_843,
      plannedAdjustment: 31_425_244,
      plannedEnding: 73_174_639,
      actualBeginning: 47_298_238,
      actualChange: 25_504_437,
      actualAdjustment: null,
      actualEnding: 72_802_675,
    })).toMatchObject({
      startRevision: 0,
      resultRevision: 31_053_280,
      planAdjustment: 31_425_244,
      auditAdjustment: 0,
      ending: 72_802_675,
    });
  });

  it("uses a compact flow equation only when both printed balance identities need no adjustment", () => {
    const common = {
      plannedMoneyIn: 10,
      plannedMoneyOut: 5,
      actualMoneyIn: 12,
      actualMoneyOut: 7,
    };
    expect(canRenderResultStories({
      ...common,
      plannedBeginning: 100,
      plannedChange: 5,
      plannedEnding: 105,
      actualBeginning: 200,
      actualChange: 5,
      actualEnding: 205,
    })).toBe(true);
    // FY2011's audited position needs its $309,372 Budget-to-GAAP adjustment.
    expect(canRenderResultStories({
      ...common,
      plannedBeginning: 48_071_989,
      plannedChange: 5,
      plannedEnding: 48_071_994,
      actualBeginning: 49_182_443,
      actualChange: 5,
      actualEnding: 49_182_443 + 5 + 309_372,
    })).toBe(false);
    // FY2022's budget book includes the signed $31,425,244 revenue-replacement line.
    expect(canRenderResultStories({
      ...common,
      plannedBeginning: 47_298_238,
      plannedChange: 5,
      plannedEnding: 47_298_238 + 5 + 31_425_244,
      actualBeginning: 47_298_238,
      actualChange: 5,
      actualEnding: 47_298_243,
    })).toBe(false);
  });
});
