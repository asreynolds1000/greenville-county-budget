import { buildFundPanelModel } from "@/lib/buildFundPanelModel";
import { getDeferredFundIds, isDeferredFund } from "@/lib/deferredFunds";

export const dynamic = "force-static";
export function generateStaticParams() {
  return getDeferredFundIds().map(entityId => ({ entityId }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  if (!isDeferredFund(entityId)) return new Response("Not found", { status: 404 });
  return new Response(buildFundPanelModel(entityId).json, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
