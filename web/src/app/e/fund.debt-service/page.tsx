import { FundExplorer } from "@/components/FundExplorer";
import { entityMetadata } from "@/lib/entityMetadata";

export function generateMetadata() {
  return entityMetadata("fund.debt-service");
}

export default function FundPage() {
  return <FundExplorer entityId="fund.debt-service" />;
}
