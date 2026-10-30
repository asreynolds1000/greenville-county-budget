import {
  getChildrenForYear, getCoveredFiscalYears, getEntityPage, getEntitySummary,
  getSeriesPointForYear, seriesBreakNotesAt,
} from "./loaders";
import { displayName } from "./format";
import type { SpendingBoundary, SpendingLine, SpendingSnapshot } from "./budgetComparison";

/** Use each year's actual hierarchy; never paint today's departments onto old figures. */
export function getSpendingComparisonData() {
  const hierarchy = getEntityPage("gf.expenditures");
  const totalPage = getEntityPage("fund.general");
  const boundaries: SpendingBoundary[] = [];
  const snapshots: SpendingSnapshot[] = getCoveredFiscalYears(hierarchy).flatMap((year) => {
    const total = getSeriesPointForYear(totalPage, year);
    const hierarchyPoint = getSeriesPointForYear(hierarchy, year);
    if (hierarchyPoint?.status_class !== "adopted") return [];
    const toLine = (id: string): SpendingLine => {
      const page = getEntityPage(id);
      const point = getSeriesPointForYear(page, year);
      for (const note of seriesBreakNotesAt(year, "department", id)) {
        boundaries.push({ year, entityId: note.scope_value === "department" ? null : id, text: note.text });
      }
      for (const boundary of page.breaks) {
        if (boundary.kind === "parent_change" && boundary.at_fy === year) {
          boundaries.push({ year, entityId: id, text: boundary.note });
        }
      }
      return {
        id, name: displayName(getEntitySummary(id)),
        value: point?.status_class === "adopted" ? point.value : null,
        printedForm: point?.status_class === "adopted" ? point.printed_form : null,
        sourceUrl: point?.status_class === "adopted" ? `${point.citation.source_url}#page=${point.citation.pdf_page}` : null,
        sourceLabel: point?.status_class === "adopted"
          ? `${point.citation.source_code}, ${point.citation.printed_page === null ? `PDF p.${point.citation.pdf_page}` : `p.${point.citation.printed_page}`}`
          : null,
      };
    };
    const children = getChildrenForYear(hierarchy, year);
    const categories = children.map((child) => toLine(child.entity_id));
    const departmentIds = new Set(children.flatMap((category) => {
      const lines = getChildrenForYear(getEntityPage(category.entity_id), year)
        .filter((child) => child.entity_id.startsWith("dept."));
      // Some historical services (including EMS) are published only as a category line.
      // Keep that leaf amount in the detailed view rather than silently dropping a service.
      return lines.length > 0 ? lines.map((child) => child.entity_id) : [category.entity_id];
    }));
    return [{
      year, total: total?.status_class === "adopted" ? total.value : null,
      detailTotal: hierarchyPoint.value,
      categories, departments: [...departmentIds].map(toLine),
    }];
  });
  const unique = new Map(boundaries.map((b) => [`${b.year}:${b.entityId}:${b.text}`, b]));
  return { snapshots, boundaries: [...unique.values()] };
}
