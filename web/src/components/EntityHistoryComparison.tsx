import { EntityHistoryComparisonClient } from "@/components/EntityHistoryComparisonClient";
import {
  buildEntityHistoryModel,
  historyBreaksFromLegacy,
  historyBreaksFromNotes,
  historySeriesKind,
} from "@/lib/history";
import {
  getEntityPage,
  getEntityNotes,
  getEntitySummary,
  isV2FiscalYearCovered,
  seriesBreakNotesAt,
} from "@/lib/loaders";
import type { V2EntityPage } from "@/lib/schema";

/**
 * Build-time wrapper for an interactive history comparison.
 *
 * The client gets only serializable, already-scoped records. It never imports loaders or
 * filesystem code, which keeps static export deterministic and the client bundle bounded.
 */
export function EntityHistoryComparison({ page, year }: { page: V2EntityPage; year: number }) {
  const seriesYears = [...new Set(page.series.map((point) => point.fiscal_year))];
  const yearHrefs = Object.fromEntries(
    seriesYears
      .filter((fiscalYear) => isV2FiscalYearCovered(page.entity_id, fiscalYear))
      .map((fiscalYear) => [fiscalYear, `/e/${page.entity_id}/?fy=${fiscalYear}`]),
  );
  const kind = historySeriesKind(page);
  const curatedNotes = [...new Map(seriesYears.flatMap((fiscalYear) => (
    seriesBreakNotesAt(fiscalYear, kind, page.entity_id)
  )).map((note) => [note.note_id, note])).values()];

  // V2 page bundles deliberately omit the old v1 `breaks` field. Where that record exists,
  // preserve its gaps and parent changes rather than pretending the new bundle is complete.
  const legacyPage = getEntitySummary(page.entity_id)
    ? getEntityPage(page.entity_id)
    : null;
  const model = buildEntityHistoryModel(page, year, [
    ...historyBreaksFromNotes(curatedNotes),
    ...historyBreaksFromLegacy(legacyPage?.breaks ?? []),
  ]);

  // An earlier selection can have a usable basis even when the latest year does not.
  if (!model.bases.length) return null;
  return <EntityHistoryComparisonClient
    key={`${page.entity_id}:${year}`}
    entityId={page.entity_id}
    model={model}
    notes={getEntityNotes(page.entity_id)}
    yearHrefs={yearHrefs}
  />;
}
