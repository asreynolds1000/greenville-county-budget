"use client";

import { FUND_BALANCE_CONTEXT } from "@/lib/readingContext";
import Link from "@/components/AppLink";
import { useCallback, useEffect, useRef, useState } from "react";

import { Amount } from "@/components/Amount";
import { RiverFigure } from "@/components/Figure";
import { ResidentOrientation } from "@/components/orientation/ResidentOrientation";
import type { OrientationGuidance } from "@/components/orientation/types";
import { describeSourceCode } from "@/lib/format";
import type { RiverModel, RiverNode } from "@/lib/river";
import styles from "./CountyMoneyExplorer.module.css";

type RiverYear = { fiscalYear: number; county: RiverModel | null; general: RiverModel | null };

function sourceHref(node: RiverNode) {
  return node.citation.sourceUrl.replace(/#.*$/, "")
    + (node.citation.pdfPage === null ? "" : `#page=${node.citation.pdfPage}`);
}

function csvHref(model: RiverModel) {
  const rows: Array<Array<string | number | null>> = [
    ["fiscal_year", "scope", "plan_status", "accounting_role", "line", "official_label", "dollars", "printed_form", "source_code", "printed_page", "pdf_page", "source_url", "description"],
    [model.fiscalYear, model.id, model.source.statusLabel, "spending_authority", model.centerLabel, null, model.authority, null, model.source.sourceCode, model.source.printedPage, null, model.source.url, model.coverageNote],
    ...[...model.sources, ...(model.reserve ? [model.reserve] : []), ...model.uses].map((node) => [
      model.fiscalYear, model.id, model.source.statusLabel,
      node.kind === "transfer" ? (model.sources.includes(node) ? "transfer_in" : "transfer_out") : node.kind,
      node.label, node.officialLabel ?? null, node.value, node.printedForm, node.citation.sourceCode,
      node.citation.printedPage, node.citation.pdfPage, sourceHref(node), node.description,
    ]),
  ];
  return "data:text/csv;charset=utf-8," + encodeURIComponent(rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"));
}

export function CountyMoneyExplorer({ years, initialYear, actualYears }: { years: RiverYear[]; initialYear: number; actualYears: number[] }) {
  const [year, setYear] = useState(initialYear);
  const [scope, setScope] = useState<"general" | "county">("general");
  const [selected, setSelected] = useState<RiverNode | null>(null);
  const [guidance, setGuidance] = useState<OrientationGuidance | null>(null);
  const [startOrientation, setStartOrientation] = useState(false);
  const [orientationRequest, setOrientationRequest] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const riverHeading = useRef<HTMLHeadingElement>(null);
  const current = years.find((item) => item.fiscalYear === year) ?? years[years.length - 1];
  const model = current?.[scope] ?? null;

  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  useEffect(() => {
    let frame: number | null = null;
    function openOrientationFromHash() {
      if (window.location.hash !== "#orientation") return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setStartOrientation(true);
        setOrientationRequest((request) => request + 1);
      });
    }
    openOrientationFromHash();
    window.addEventListener("hashchange", openOrientationFromHash);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openOrientationFromHash);
    };
  }, []);

  function closeDetail() {
    dialog.current?.close();
    setSelected(null);
  }

  function changeScope(next: "general" | "county") {
    closeDetail();
    setScope(next);
  }

  function changeYear(next: number) {
    closeDetail();
    setYear(next);
  }

  const changeGuidance = useCallback((next: OrientationGuidance | null) => {
    setGuidance(next);
  }, []);

  function finishOrientation() {
    setStartOrientation(false);
    window.requestAnimationFrame(() => {
      const target = riverHeading.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  }

  function startOrientationGuide() {
    closeDetail();
    setScope("general");
  }

  function selectGuidedNode(node: RiverNode) {
    closeDetail();
    setScope("general");
    setSelected(node);
  }

  return (
    <section className={styles.explorer} aria-labelledby="money-explorer-title" data-testid="county-money-explorer">
      <ResidentOrientation
        year={year}
        actualYears={actualYears}
        general={current?.general ?? null}
        onYearChange={changeYear}
        onGuidanceChange={changeGuidance}
        onFinish={finishOrientation}
        onStart={startOrientationGuide}
        onNodeSelect={selectGuidedNode}
        startOnMount={startOrientation}
        startRequest={orientationRequest}
      />

      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>{scope === "general" ? `The General Fund · one of the four fund groups shown here · FY${year} plan` : `The four fund groups in the published total · FY${year} plan`}</p>
          <h2 id="money-explorer-title" ref={riverHeading} tabIndex={-1}>{scope === "general" ? "Where the money comes from and goes" : "Four fund groups, each with a purpose"}</h2>
          <p>{scope === "general"
            ? "The General Fund is the county’s main account for everyday services. See what funds it and explore the services it supports."
            : "A fund keeps a separate set of accounts. These four groups make up the county’s published budget total. Each has its own funding and rules."}</p>
        </div>
        <p className={styles.period}>July {year - 1}–June {year}<span>Planned spending; actual results can differ.</span></p>
      </div>

      <p id="scope-choice-help" className={styles.toolbarHint}>Start with everyday services in the General Fund, or see the four fund groups together.</p>
      <div className={styles.toolbar}>
        <div className={styles.scopes} role="group" aria-label="Budget scope" aria-describedby="scope-choice-help">
          <button type="button" aria-pressed={scope === "county"} onClick={() => changeScope("county")}>
            Four fund groups
          </button>
          <button type="button" aria-pressed={scope === "general"} onClick={() => changeScope("general")}>
            General Fund
          </button>
        </div>
        <label className={styles.year}>
          Budget year
          <select value={year} onChange={(event) => changeYear(Number(event.target.value))}>
            {[...years].reverse().map((item) => <option key={item.fiscalYear} value={item.fiscalYear}>FY{item.fiscalYear}</option>)}
          </select>
        </label>
      </div>

      {model ? <>
        <p className={styles.instruction}><span aria-hidden="true">↗</span> Select a funding source or spending area to see what it covers.</p>
        <RiverFigure
          model={model}
          selectedId={selected?.id}
          guidedNodeIds={scope === "general" ? guidance?.nodeIds : undefined}
          onSelect={setSelected}
          downloadHref={csvHref(model)}
          caption={scope === "general"
            ? `FY${year} General Fund funding and uses, sized by dollars. Funding supports the fund as a whole; it does not trace particular taxes to particular services. Transfers move money between funds. ${FUND_BALANCE_CONTEXT}`
            : `The four fund groups that make up the FY${year} adopted budget, sized by dollars. This is gross spending authority, including transfers between funds; it is not a consolidated total of revenue or external service spending.`}
        />
        {scope === "general" && <div className={styles.equation} aria-label="General Fund funding reconciliation">
          <p><span>Total money in</span><strong><Amount value={model.sourceTotal} printedForm={null} /></strong><small>Revenue plus transfers in</small></p>
          <span aria-hidden="true">+</span>
          <p><span>Planned use of fund balance</span><strong><Amount value={model.reserve?.value ?? null} printedForm={model.reserve?.printedForm ?? null} /></strong><small>A draw on fund balance</small></p>
          <span aria-hidden="true">=</span>
          <p><span>Planned money out</span><strong><Amount value={model.authority} printedForm={null} /></strong><small>Services plus transfers out</small></p>
        </div>}
        {model.coverageNote && <p className={styles.coverage}>{model.coverageNote}</p>}
        <div className={styles.footerLinks}>
          <Link href={`/e/${scope === "general" ? "fund.general" : "budget.total"}/?fy=${year}`}>Open the full FY{year} {scope === "general" ? "General Fund" : "county budget"} →</Link>
          <Link href={`/e/${scope === "general" ? "fund.general" : "budget.total"}/?fy=${year}#change-over-time`}>See how it changed over time →</Link>
        </div>
      </> : <p className={styles.coverage}>A complete funding and spending breakdown is not available for this year. <Link href={`/e/${scope === "general" ? "fund.general" : "budget.total"}/?fy=${year}`}>Open the available budget detail.</Link></p>}

      <dialog ref={dialog} className={styles.detail} aria-labelledby="river-detail-title" onClose={() => setSelected(null)}>
        {selected && model && <>
          <div className={styles.detailTop}>
            <p className={styles.eyebrow}>FY{year} · {scope === "general" ? "General Fund" : "County budget"}</p>
            <button type="button" onClick={closeDetail} aria-label="Close budget details" className={styles.close}>×</button>
          </div>
          <div className={styles.detailMarker} style={{ backgroundColor: selected.color }} />
          <h3 id="river-detail-title">{selected.label}</h3>
          {selected.officialLabel && selected.officialLabel !== selected.label && <p className={styles.detailOfficial}>County budget label: {selected.officialLabel}</p>}
          <p className={styles.detailAmount}><Amount value={selected.value} printedForm={selected.printedForm} /></p>
          <p className={styles.detailShare}>{(selected.value / model.authority * 100).toFixed(1)}% of {scope === "general" ? "General Fund" : "four-fund"} spending authority</p>
          <p className={styles.detailDescription}>{selected.description}</p>
          {selected.context && <section className={styles.detailContext} aria-labelledby="river-context-title">
            <h4 id="river-context-title">{selected.context.title}</h4>
            <p>{selected.context.summary}</p>
            <p className={styles.contextSources}>Context sources: {selected.context.sources.map((source, index) => <span key={source.href}>{index > 0 && ", "}<a href={source.href} target="_blank" rel="noreferrer">{source.label}</a></span>)}</p>
          </section>}
          {selected.serviceExamples && selected.serviceExamples.length > 0 && <section className={styles.detailExamples} aria-labelledby="river-services-title">
            <h4 id="river-services-title">Services in this category</h4>
            <p>These services are included in this category’s total.</p>
            <ul>{selected.serviceExamples.map((service) => <li key={service.id}><Link href={service.href}>{service.label} →</Link></li>)}</ul>
          </section>}
          {selected.kind === "revenue" && <p className={styles.detailNote}>This revenue supports the fund as a whole. It is not assigned here to an individual service.</p>}
          <a href={sourceHref(selected)} target="_blank" rel="noreferrer" className={styles.detailSource}>
            Source: {describeSourceCode(selected.citation.sourceCode)}{selected.citation.printedPage !== null ? `, printed page ${selected.citation.printedPage}` : ""} ↗
          </a>
          <div className={styles.detailActions}>
            {selected.id === "fund.general" && scope === "county" && <button type="button" onClick={() => changeScope("general")}>Explore this fund →</button>}
            {selected.href && <Link href={selected.href}>Open budget details and history →</Link>}
          </div>
        </>}
      </dialog>
    </section>
  );
}
