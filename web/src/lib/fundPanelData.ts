import type { GeneralFundYearGroup } from "@/lib/loaders";
import type {
  CoverageDomain, DataNote, EntityPage, GeneralFundBudgetActualComparison,
  SeriesPoint, Source, V2Coverage, V2EntitySummary, V2SeriesPoint, V2Statement,
} from "@/lib/schema";

export type FundLabel = Pick<V2EntitySummary, "canonical_name" | "display_name" | "plain_language_description">;
export type FundCommon = {
  entities: Record<string, FundLabel>;
  sources: Record<string, Pick<Source, "document_title_version" | "archive_url" | "archived_on">>;
  coveredYears: Record<string, number[]>;
};
export type FundStatementInstance = V2Statement["instances"][number];

export type GeneralFundInput = {
  kind: "general";
  year: number;
  yearGroups: GeneralFundYearGroup[];
  pageNotes: DataNote[];
  dataNotes: DataNote[];
  statements: Record<string, FundStatementInstance | null>;
  comparison: GeneralFundBudgetActualComparison | null;
  revenuePoints: Record<string, V2SeriesPoint | null>;
  overviewName: string;
};

export type FundGroupInput = {
  kind: "group";
  year: number;
  page: Pick<EntityPage, "entity_id" | "canonical_name" | "display_name" | "plain_language_description">;
  point: SeriesPoint | null;
  value: number | null;
  children: Array<{ entity_id: string; value: number | null; label: FundLabel; point: SeriesPoint | null }>;
  coverage: Record<CoverageDomain, V2Coverage>;
  members: Record<CoverageDomain, FundStatementInstance["members"]>;
};

export type FundPanelInput = GeneralFundInput | FundGroupInput;

export function hasFundYear(common: FundCommon, entityId: string, year: number): boolean {
  return common.coveredYears[entityId]?.includes(year) ?? false;
}
