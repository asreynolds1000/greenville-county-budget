"use client";

import { Component, Suspense, use, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { FundCommon, FundPanelInput } from "@/lib/fundPanelData";
import { fundInputForYear, loadFundPanelModel, retryFundPanelModel } from "@/lib/fundPanelResource";
import { EntityYearSharedSlot } from "@/components/EntityYearExplorer";

// Keep SSR enabled: the latest panel and chart/download area remain available without JavaScript.
const GeneralFundYearPanel = dynamic(() => import("@/components/GeneralFundYearPanel").then(module => module.GeneralFundYearPanel));
const FundGroupYearPanel = dynamic(() => import("@/components/FundGroupYearPanel").then(module => module.FundGroupYearPanel));

/** Dynamic imports in a client boundary keep fund renderers off ordinary entity pages. */
type PanelProps = {
  entityId: string; year: number; revision: string; input: FundPanelInput | null;
  common: FundCommon; correction: ReactNode; services?: ReactNode;
};

function RenderPanel({ input, common, correction, services }: Pick<PanelProps, "common" | "correction" | "services"> & { input: FundPanelInput }) {
  return input.kind === "general"
    ? <GeneralFundYearPanel input={input} common={common} correction={correction} services={services} />
    : <FundGroupYearPanel input={input} common={common} correction={correction} />;
}

function HistoricalPanel(props: PanelProps) {
  const model = use(loadFundPanelModel(props.entityId, props.revision));
  return <RenderPanel {...props} common={model.common} input={fundInputForYear(model, props.year)} />;
}

function LoadingPanel({ year }: { year: number }) {
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
    <p role="status">Loading FY{year} figures and sources…</p>
    <EntityYearSharedSlot name="chart" />
  </main>;
}

class FundLoadBoundary extends Component<{ entityId: string; year: number; revision: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <p role="alert">FY{this.props.year} figures could not be loaded. Retry, or reload the page to get its current data.</p>
      <button type="button" className="mt-3 min-h-11 rounded border border-hairline px-4" onClick={() => {
        retryFundPanelModel(this.props.entityId, this.props.revision);
        this.setState({ failed: false });
      }}>Retry FY{this.props.year}</button>
      <EntityYearSharedSlot name="chart" />
    </main>;
  }
}

export function FundYearPanel(props: PanelProps) {
  if (props.input) return <RenderPanel {...props} input={props.input} />;
  return <FundLoadBoundary key={`${props.entityId}:${props.year}:${props.revision}`} entityId={props.entityId} year={props.year} revision={props.revision}>
    <Suspense fallback={<LoadingPanel year={props.year} />}><HistoricalPanel {...props} /></Suspense>
  </FundLoadBoundary>;
}
