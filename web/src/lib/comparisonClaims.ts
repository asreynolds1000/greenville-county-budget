import type { GeneralFundComparisonSection } from "./schema";

/** Resident-facing names for the row groups the comparison exporter actually ships. */
const SECTION_LABEL: Record<GeneralFundComparisonSection, string> = {
  revenue_categories: "revenue category",
  spending_categories: "broad spending category",
};

export function comparisonGranularityText(
  sections: GeneralFundComparisonSection[],
): string {
  if (sections.length === 0) {
    throw new Error("A comparison with no row groups cannot make a granularity claim");
  }
  return `by ${sections.map((section) => SECTION_LABEL[section]).join(" and by ")}`;
}
