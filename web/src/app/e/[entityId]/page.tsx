import type { Metadata } from "next";

import { EntityExplorer } from "@/components/EntityExplorer";
import { getV2EntityIds } from "@/lib/loaders";
import { entityMetadata } from "@/lib/entityMetadata";
import { isFundView } from "@/lib/fundViews";

type RouteParams = { entityId: string };

export function generateStaticParams(): RouteParams[] {
  return getV2EntityIds().filter(entityId => !isFundView(entityId)).map((entityId) => ({ entityId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { entityId } = await params;
  return entityMetadata(entityId);
}

export default async function EntityLatestYearPage({ params }: { params: Promise<RouteParams> }) {
  const { entityId } = await params;
  return <EntityExplorer entityId={entityId} />;
}
