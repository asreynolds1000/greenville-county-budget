"use client";

import type { ReactNode } from "react";
import { EntityYearSharedSlot } from "@/components/EntityYearExplorer";
import { FundGroupContent } from "@/components/FundGroupContent";
import type { FundCommon, FundGroupInput } from "@/lib/fundPanelData";

export function FundGroupYearPanel({ input, common, correction }: {
  input: FundGroupInput; common: FundCommon; correction: ReactNode;
}) {
  return <FundGroupContent input={input} common={common} correction={correction}
    history={<EntityYearSharedSlot name="chart" />} yearSelector={null} />;
}
