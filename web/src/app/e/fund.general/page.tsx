import { FundExplorer } from "@/components/FundExplorer";
import { entityMetadata } from "@/lib/entityMetadata";

export function generateMetadata() {
  return entityMetadata("fund.general");
}

export default function FundPage() {
  return <FundExplorer entityId="fund.general" />;
}
