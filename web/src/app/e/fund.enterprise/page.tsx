import { FundExplorer } from "@/components/FundExplorer";
import { entityMetadata } from "@/lib/entityMetadata";

export function generateMetadata() {
  return entityMetadata("fund.enterprise");
}

export default function FundPage() {
  return <FundExplorer entityId="fund.enterprise" />;
}
