import { V2EntityYearView } from "@/components/V2EntityYearView";
import { getV2EntityPage } from "@/lib/loaders";

/** Ordinary entities share one server-rendered history across their fiscal-year panels. */
export function EntityView({ entityId, year }: { entityId: string; year: number }) {
  return <V2EntityYearView page={getV2EntityPage(entityId)} year={year} />;
}
