import type { RiverModel } from "@/lib/river";
import type { RiverNode } from "@/lib/river";

export type OrientationStep = 1 | 2 | 3 | 4;

export type OrientationGuidance = {
  step: OrientationStep;
  nodeIds: string[];
};

export type ResidentOrientationProps = {
  year: number;
  actualYears: number[];
  general: RiverModel | null;
  onYearChange: (year: number) => void;
  onGuidanceChange: (guidance: OrientationGuidance | null) => void;
  onFinish: () => void;
  onStart: () => void;
  onNodeSelect: (node: RiverNode) => void;
  startOnMount?: boolean;
  startRequest?: number;
};
