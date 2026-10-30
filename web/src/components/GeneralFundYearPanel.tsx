"use client";

import type { ReactNode } from "react";
import { EntityYearSharedSlot } from "@/components/EntityYearExplorer";
import { GeneralFundCycleContent } from "@/components/GeneralFundCycleContent";
import type { FundCommon, GeneralFundInput } from "@/lib/fundPanelData";

export function GeneralFundYearPanel({ input, common, correction, services }: {
  input: GeneralFundInput; common: FundCommon; correction: ReactNode; services?: ReactNode;
}) {
  return <GeneralFundCycleContent input={input} common={common} correction={correction}
    services={services} history={<EntityYearSharedSlot name="chart" />} />;
}
