import { FundExplorer } from "@/components/FundExplorer";
import { entityMetadata } from "@/lib/entityMetadata";

export function generateMetadata() {
  return entityMetadata("fund.special-revenue");
}

export default function FundPage() {
  return <FundExplorer entityId="fund.special-revenue" />;
}
