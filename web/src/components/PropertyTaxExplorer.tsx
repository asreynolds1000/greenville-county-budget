"use client";

import Link from "@/components/AppLink";
import { useEffect, useRef, useState } from "react";

import {
  calculatePropertyTax,
  taxData,
  type CalculatedPropertyTax,
  type PropertyTaxInput,
  type TaxAllocation,
} from "@/lib/propertyTax";
import {
  resolvePropertySuggestion,
  searchProperties,
  type PropertyMatch,
  type PropertySuggestion,
} from "@/lib/propertyLookup";
import {
  loadPropertyRecord,
  propertyRecordSourceUrl,
  type PropertyRecord,
} from "@/lib/propertyRecord";
import { getTaxRecipientInfo } from "@/lib/taxRecipients";

import styles from "./PropertyTaxExplorer.module.css";
import { PersonalTaxServiceBridge } from "./PersonalTaxServiceBridge";
import { TaxingEntityOverview } from "./TaxingEntityOverview";

export { TaxingEntityOverview } from "./TaxingEntityOverview";
type AssessmentRatio = "" | 4 | 6;

function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function estimateCsvHref(
  result: CalculatedPropertyTax,
  input: PropertyTaxInput,
): string {
  const lines = sortAllocationLines(result.lines);
  const rows = [
    ["field", "value"],
    ["tax_year", result.taxYear],
    ["district", input.districtCode],
    ["taxable_market_value", input.taxableMarketValue.toFixed(2)],
    ["assessment_ratio", `${input.assessmentRatio}%`],
    ["homestead", input.homestead ? "yes" : "no"],
    ["taxable_value_after_homestead", result.taxableValueAfterHomestead.toFixed(2)],
    ["assessed_value", result.assessedValue.toFixed(2)],
    ["school_relief_already_applied", result.schoolRelief.toFixed(2)],
    ["estimated_total_before_fees_and_other_credits", result.total.toFixed(2)],
    ["source_url", taxData.sourceUrl],
    ["source_sha256", taxData.sourceSha256],
    ["estimate_note", "Published millage estimate; excludes fees, other credits, penalties, and other parcel-specific charges."],
    [],
    ["recipient", "group", "mills", "estimated_amount", "source_page"],
    ...lines.map((line) => [line.label, line.group, line.mills, line.amount.toFixed(2), line.sourcePage]),
    ["Estimated total", "", "", result.total.toFixed(2), ""],
  ];
  return `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map((row) => row.map(csvCell).join(",")).join("\n"))}`;
}

function sortAllocationLines(lines: TaxAllocation[]): TaxAllocation[] {
  return [...lines].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

const allocationColors = ["#176b5b", "#b65f2a", "#3f6096", "#8a5a9e", "#82712d", "#3f7e83", "#a3425d", "#4b6f44", "#93683a", "#5a5b8c", "#9b4f72", "#507b8b", "#765c39", "#4e704f", "#7560a0", "#a65c3b"];
const allocationColorById: Record<string, string> = {
  "county-operations": allocationColors[0],
  "county-debt": allocationColors[11],
  library: allocationColors[3],
  "technical-college": allocationColors[4],
  "museum-operations": allocationColors[5],
  "museum-debt": allocationColors[6],
  school: allocationColors[2],
  "greenville-school-debt": allocationColors[2],
  fire: allocationColors[1],
  other: allocationColors[7],
  city: allocationColors[8],
  sanitation: allocationColors[9],
  arena: allocationColors[10],
};

function colorForAllocation(id: string): string {
  if (allocationColorById[id]) return allocationColorById[id];
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return allocationColors[hash % allocationColors.length];
}

function lookupMessage(kind: string): string {
  if (kind === "no_match") return "No parcel matched that search. Check the street address, try a tax map/PIN number, or review the details below.";
  if (kind === "unavailable") return "The county parcel lookup is temporarily unavailable. Review or enter the estimate details below.";
  return "";
}

function AllocationDetail({ line }: { line: TaxAllocation }) {
  const countyBudgetHref = line.id === "county-debt" ? "/e/fund.debt-service/" : "/e/fund.general/#money-out";
  const recipientInfo = getTaxRecipientInfo(line);
  return (
    <div id={`tax-detail-${line.id}`} tabIndex={-1} className="my-2 border-l-2 border-accent bg-surface p-4 text-sm leading-relaxed text-ink" role="region" aria-label={`${line.label} explained`}>
      <p>{recipientInfo.summary}</p>
      {recipientInfo.levyNote && <p className="mt-2 text-ink-secondary">{recipientInfo.levyNote}</p>}
      <a href={`${taxData.sourceUrl}#page=${line.sourcePage}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-accent underline underline-offset-2">Source page {line.sourcePage} · {line.mills} mills</a>
      {recipientInfo.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="mt-1 flex min-h-11 items-center text-accent underline underline-offset-2">{source.label} →</a>)}
      {line.group === "county" && <>
        <Link href={countyBudgetHref} className="mt-1 flex min-h-11 items-center text-accent underline underline-offset-2">
          {line.id === "county-debt" ? "Explore county debt payments →" : "Explore General Fund services →"}
        </Link>
        <p className="text-xs text-ink-secondary">The budget opens its latest published fiscal year. This estimate uses 2025 tax rates. County budgets also use fees, aid, transfers and other money.</p>
      </>}
    </div>
  );
}

function AllocationList({
  lines,
  total,
  selectedId,
  onSelect,
}: {
  lines: TaxAllocation[];
  total: number;
  selectedId: string | null;
  onSelect: (line: TaxAllocation) => void;
}) {
  const sortedLines = sortAllocationLines(lines);
  return (
    <div className={styles.allocation} aria-label="Estimated tax allocation" role="list">
      {sortedLines.map((line, index) => {
        const share = total > 0 ? (line.amount / total) * 100 : 0;
        const color = colorForAllocation(line.id);
        return (
          <div key={line.id} role="listitem">
            <button
              type="button"
              className={styles.allocationButton}
              data-active={selectedId === line.id}
              aria-pressed={selectedId === line.id}
              aria-expanded={selectedId === line.id}
              aria-controls={selectedId === line.id ? `tax-detail-${line.id}` : undefined}
              onClick={() => onSelect(line)}
            >
            <span className={styles.allocationHeader}>
              <span className={styles.allocationLabel}>
                <span className={styles.allocationSwatch} aria-hidden="true" style={{ backgroundColor: color }} />
                <span className={styles.allocationRank} aria-hidden="true">{index + 1}</span>
                <strong>{line.label}</strong>
                <span className="ml-2 font-mono text-xs text-ink-secondary">{line.mills} mills</span>
              </span>
              <span className="font-mono tabular-nums">{formatDollars(line.amount)} <span className="text-xs text-ink-secondary">({share.toFixed(1)}%)</span></span>
            </span>
            <span className={styles.allocationBar} aria-hidden="true">
              <span className={styles.allocationFill} style={{ width: `${share}%`, backgroundColor: color }} />
            </span>
            </button>
            {selectedId === line.id && <AllocationDetail line={line} />}
          </div>
        );
      })}
    </div>
  );
}

export function PropertyTaxExplorer({ budgetYear }: { budgetYear: number }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PropertySuggestion[]>([]);
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [lookupStatus, setLookupStatus] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<PropertyMatch | null>(null);
  const [districtCode, setDistrictCode] = useState("");
  const [taxableValue, setTaxableValue] = useState("");
  const [assessmentRatio, setAssessmentRatio] = useState<AssessmentRatio>("");
  const [homestead, setHomestead] = useState<"" | "yes" | "no">("");
  const [result, setResult] = useState<ReturnType<typeof calculatePropertyTax> | null>(null);
  const [calculationInput, setCalculationInput] = useState<PropertyTaxInput | null>(null);
  const [selectedLine, setSelectedLine] = useState<TaxAllocation | null>(null);
  const [propertyRecord, setPropertyRecord] = useState<PropertyRecord | null>(null);
  const [recordStatus, setRecordStatus] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const recordRequestId = useRef(0);
  const recordController = useRef<AbortController | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const districtInputRef = useRef<HTMLSelectElement>(null);
  const taxableValueInputRef = useRef<HTMLInputElement>(null);
  const assessmentRatioInputRef = useRef<HTMLSelectElement>(null);
  const homesteadInputRef = useRef<HTMLSelectElement>(null);
  const detailsStatusRef = useRef<HTMLParagraphElement>(null);
  const detailsErrorRef = useRef<HTMLParagraphElement>(null);
  const detailsSummaryRef = useRef<HTMLElement>(null);
  const focusResultAfterUpdate = useRef(false);
  const resultFocusRequest = useRef(0);

  const selectAllocationFromChart = (line: TaxAllocation) => {
    const isSelected = selectedLine?.id === line.id;
    setSelectedLine(isSelected ? null : line);
    if (isSelected) return;
    window.requestAnimationFrame(() => {
      const detail = document.getElementById(`tax-detail-${line.id}`);
      if (!detail) return;
      detail.focus({ preventScroll: true });
      detail.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    });
  };

  useEffect(() => () => {
    controller.current?.abort();
    recordController.current?.abort();
  }, []);
  useEffect(() => {
    if (!focusResultAfterUpdate.current || result?.kind !== "calculated") return;
    focusResultAfterUpdate.current = false;
    const request = resultFocusRequest.current;
    window.requestAnimationFrame(() => {
      if (request !== resultFocusRequest.current) return;
      const heading = resultHeadingRef.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }, [result]);

  const districts = taxData.districts;
  const selectedDistrict = districts.find((district) => district.code === districtCode);

  const invalidateCalculation = () => {
    resultFocusRequest.current += 1;
    focusResultAfterUpdate.current = false;
    setResult(null);
    setCalculationInput(null);
    setSelectedLine(null);
  };

  const cancelRecordFill = () => {
    recordRequestId.current += 1;
    recordController.current?.abort();
  };

  const clearRecord = () => {
    cancelRecordFill();
    setPropertyRecord(null);
    setRecordStatus("");
  };

  const cancelRecordForInputEdit = () => {
    requestId.current += 1;
    controller.current?.abort();
    setSuggestions([]);
    setMatches([]);
    cancelRecordFill();
    const status = propertyRecord
      ? "You changed the estimate inputs after the county record loaded. Your edits are used for the estimate."
      : "";
    setLookupStatus(status);
    setRecordStatus(status);
  };

  const focusRequiredDetails = (target: "district" | "value" | "ratio" | "homestead" | "status") => {
    setDetailsOpen(true);
    const request = resultFocusRequest.current;
    window.requestAnimationFrame(() => {
      if (request !== resultFocusRequest.current) return;
      const element = target === "district" ? districtInputRef.current
        : target === "value" ? taxableValueInputRef.current
          : target === "ratio" ? assessmentRatioInputRef.current
            : target === "homestead" ? homesteadInputRef.current
              : detailsErrorRef.current ?? detailsStatusRef.current ?? detailsSummaryRef.current;
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
      });
    });
  };

  /** A new county lookup must never leave an old parcel's inputs or result in view. */
  const clearSelectedProperty = () => {
    clearRecord();
    setSuggestions([]);
    setMatches([]);
    setSelectedProperty(null);
    setDistrictCode("");
    setTaxableValue("");
    setAssessmentRatio("");
    setHomestead("");
    invalidateCalculation();
    setDetailsOpen(false);
  };

  const applyCalculation = (input: PropertyTaxInput, focusResult: boolean, closeDetails: boolean) => {
    resultFocusRequest.current += 1;
    const next = calculatePropertyTax(input);
    setCalculationInput(next.kind === "calculated" ? input : null);
    setResult(next);
    setSelectedLine(null);
    focusResultAfterUpdate.current = next.kind === "calculated" && focusResult;
    if (next.kind === "calculated") {
      if (closeDetails) setDetailsOpen(false);
    } else {
      focusRequiredDetails("status");
    }
    return next;
  };

  const loadSelectedPropertyRecord = async (property: PropertyMatch) => {
    recordRequestId.current += 1;
    const currentRequest = recordRequestId.current;
    recordController.current?.abort();
    const nextController = new AbortController();
    recordController.current = nextController;
    setPropertyRecord(null);
    setRecordStatus(`Loading ${taxData.taxYear} tax record…`);

    const response = await loadPropertyRecord(property.pin, taxData.taxYear, nextController.signal);
    if (currentRequest !== recordRequestId.current || response.kind === "aborted") return;
    if (response.kind === "found") {
      const { record } = response;
      setPropertyRecord(record);
      setDistrictCode(record.district);
      // A null tax-year record value is meaningful: never keep a current GIS value in its place.
      setTaxableValue(record.taxableMarketValue === null ? "" : String(record.taxableMarketValue));
      setAssessmentRatio(record.assessmentRatio ?? "");
      setHomestead(record.homestead === null ? "" : record.homestead ? "yes" : "no");
      const recordInput = record.taxableMarketValue === null || record.assessmentRatio === null || record.homestead === null
        ? null
        : {
            districtCode: record.district,
            taxableMarketValue: record.taxableMarketValue,
            assessmentRatio: record.assessmentRatio,
            homestead: record.homestead,
          } satisfies PropertyTaxInput;
      if (recordInput) {
        const calculation = applyCalculation(recordInput, true, true);
        const status = calculation.kind === "calculated"
          ? `Your ${taxData.taxYear} county record supplied the details for this estimate.`
          : `Your ${taxData.taxYear} county record needs review before an estimate can be shown. Review the details below.`;
        setLookupStatus(status);
        setRecordStatus(status);
        return;
      }
      invalidateCalculation();
      setDetailsOpen(true);
      const missing = [
        record.taxableMarketValue === null ? "taxable market value" : null,
        record.assessmentRatio === null ? "assessment ratio" : null,
        record.homestead === null ? "Homestead status" : null,
      ].filter((field): field is string => field !== null);
      const status = `Your ${taxData.taxYear} county record is missing ${missing.join(", ")}. Review or enter the details below.`;
      setLookupStatus(status);
      setRecordStatus(status);
      return;
    }
    setDistrictCode(property.district);
    setTaxableValue(property.taxableMarketValue === null ? "" : String(property.taxableMarketValue));
    setAssessmentRatio("");
    setHomestead("");
    invalidateCalculation();
    setDetailsOpen(true);
    const status = `${taxData.taxYear} county record is unavailable. District and taxable market value are from current county GIS and may differ from the ${taxData.taxYear} record. Review the details below.`;
    setLookupStatus(status);
    setRecordStatus(status);
  };

  const changeQuery = (value: string) => {
    requestId.current += 1;
    controller.current?.abort();
    setQuery(value);
    clearSelectedProperty();
    setLookupStatus("");
  };

  const clearQuery = () => {
    changeQuery("");
    queryInputRef.current?.focus({ preventScroll: true });
  };

  const showLookupFailure = (status: string) => {
    setLookupStatus(status);
    setDetailsOpen(true);
  };

  const startLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setLookupStatus("Enter a street address or tax map/PIN number.");
      return;
    }
    requestId.current += 1;
    const currentRequest = requestId.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    clearSelectedProperty();
    setLookupStatus("Looking up the parcel…");
    try {
      const response = await searchProperties(trimmed, nextController.signal);
      if (currentRequest !== requestId.current || response.kind === "aborted") return;
      if (response.kind === "matches") {
        if (response.matches.length === 1) chooseProperty(response.matches[0], "county");
        else {
          setMatches(response.matches);
          setLookupStatus("Choose the matching property below.");
        }
      } else if (response.kind === "suggestions") {
        setSuggestions(response.suggestions);
        setLookupStatus("Choose an exact address to continue.");
      } else {
        showLookupFailure(lookupMessage(response.kind));
      }
    } catch {
      if (currentRequest === requestId.current) showLookupFailure("The county parcel lookup is temporarily unavailable. Review or enter the estimate details below.");
    }
  };

  const chooseSuggestion = async (suggestion: PropertySuggestion) => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    clearSelectedProperty();
    setLookupStatus("Confirming that parcel…");
    try {
      const response = await resolvePropertySuggestion(suggestion, nextController.signal);
      if (currentRequest !== requestId.current || response.kind === "aborted") return;
      if (response.kind === "matches") {
        if (response.matches.length === 1) chooseProperty(response.matches[0], "county");
        else {
          setMatches(response.matches);
          setLookupStatus("Choose the matching property below.");
        }
      } else {
        showLookupFailure(lookupMessage(response.kind));
      }
    } catch {
      if (currentRequest === requestId.current) showLookupFailure("The county parcel lookup is temporarily unavailable. Review or enter the estimate details below.");
    }
  };

  const chooseProperty = (property: PropertyMatch, source: "county" | "choice" = "choice") => {
    requestId.current += 1;
    controller.current?.abort();
    setSelectedProperty(property);
    // These provisional GIS fields remain editable if the official record is
    // unavailable. A found tax-year record always replaces them, including
    // clearing a field whose record value is explicitly null.
    setDistrictCode(property.district);
    setTaxableValue(property.taxableMarketValue === null ? "" : String(property.taxableMarketValue));
    setAssessmentRatio("");
    setHomestead("");
    setMatches([]);
    setLookupStatus(source === "county"
      ? `Parcel found. Loading ${taxData.taxYear} tax record…`
      : `Property selected. Loading ${taxData.taxYear} tax record…`);
    setResult(null);
    setCalculationInput(null);
    setSelectedLine(null);
    setDetailsOpen(false);
    void loadSelectedPropertyRecord(property);
  };

  const calculate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!districtCode || taxableValue.trim() === "" || assessmentRatio === "" || homestead === "") {
      resultFocusRequest.current += 1;
      setResult({ kind: "unsupported", reason: "Choose a district, taxable value, property use, and homestead status before calculating." });
      setCalculationInput(null);
      focusResultAfterUpdate.current = false;
      focusRequiredDetails(!districtCode ? "district" : taxableValue.trim() === "" ? "value" : assessmentRatio === "" ? "ratio" : "homestead");
      return;
    }
    const rawValue = taxableValue.trim();
    if (!/^\$?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(rawValue)) {
      resultFocusRequest.current += 1;
      setResult({ kind: "unsupported", reason: "Enter a taxable market value of $0 or more using numbers, such as 300000 or $300,000." });
      setCalculationInput(null);
      focusResultAfterUpdate.current = false;
      focusRequiredDetails("value");
      return;
    }
    const value = Number(rawValue.replace(/[$,]/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      resultFocusRequest.current += 1;
      setResult({ kind: "unsupported", reason: "Enter a taxable market value of $0 or more." });
      setCalculationInput(null);
      focusResultAfterUpdate.current = false;
      focusRequiredDetails("value");
      return;
    }
    const input: PropertyTaxInput = {
      districtCode,
      taxableMarketValue: value,
      assessmentRatio,
      homestead: homestead === "yes",
    };
    applyCalculation(input, true, false);
  };

  return (
    <div className="space-y-6">
      <details className="mt-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent underline underline-offset-2">Why doesn&rsquo;t all of my bill stay with the county?</summary>
        <div className="mt-3"><TaxingEntityOverview /></div>
      </details>

      <section className="border-t border-hairline pt-8" aria-labelledby="tax-lookup-title">
        <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">Tax year {taxData.taxYear}</p>
        <h2 id="tax-lookup-title" className="mt-2 font-display text-2xl font-semibold tracking-tight">Find your property</h2>
        <form className="mt-5" onSubmit={startLookup}>
            <label htmlFor="property-query" className="block font-medium text-ink">Street address</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className={styles.queryInputWrapper}>
                <input ref={queryInputRef} id="property-query" type="search" value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="123 Main Street" className={`${styles.queryInput} min-h-11 min-w-0 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 pr-12 text-ink focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent`} />
                {query.length > 0 && <button type="button" className={styles.clearButton} aria-label="Clear address or PIN" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={clearQuery}><span aria-hidden="true">×</span></button>}
              </div>
              <button type="submit" className="min-h-11 rounded-md bg-ink px-4 py-2.5 font-medium text-white hover:bg-ink/90">Find parcel</button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">You can also enter a tax map/PIN number. We do not save searches in this app or add your address or PIN to this page’s URL. Your browser sends the address lookup to county GIS. After you choose a parcel, its PIN is sent to our server to retrieve the {taxData.taxYear} county record. Google Analytics counts page visits but never receives your address or PIN. The county and hosting provider may have their own logs.</p>
            {lookupStatus && !selectedProperty && <p className="mt-3 text-sm leading-relaxed text-ink-secondary" role="status">{lookupStatus}</p>}
            {suggestions.length > 0 && <div className={styles.suggestions} role="group" aria-label="Address choices">{suggestions.map((suggestion) => <button key={suggestion.magicKey} type="button" className={styles.suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion.label}</button>)}</div>}
            {matches.length > 0 && <div className={styles.candidates} role="group" aria-label="Parcel choices"><p className="mt-3 text-sm text-ink-secondary">More than one county parcel matched. Compare the district and taxable market value, then choose the property to use.</p>{matches.map((property) => <button key={property.pin} type="button" className={styles.candidate} onClick={() => chooseProperty(property)}><strong>Use this property: {property.address}</strong><span className="mt-1 block text-xs text-ink-secondary">PIN {property.pin} · District {property.district} · {property.taxableMarketValue === null ? "Taxable market value not provided" : `Taxable market value ${formatDollars(property.taxableMarketValue)}`}</span></button>)}</div>}
          </form>

        {selectedProperty && <div className={styles.selectedProperty}>
          <strong>Selected property: {selectedProperty.address}</strong>
          {recordStatus && <p role="status" className="mt-2 text-xs leading-relaxed text-ink-secondary">{recordStatus}</p>}
          <a href={propertyRecordSourceUrl(selectedProperty.pin, taxData.taxYear, propertyRecord)} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-2">View official {taxData.taxYear} county record →</a>
          {propertyRecord?.taxes !== null && propertyRecord?.taxes !== undefined && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">Taxes listed for {taxData.taxYear}: <span className="font-mono tabular-nums text-ink">{formatDollars(propertyRecord.taxes)}</span>. This is the county record&apos;s listed total, not this estimate&apos;s allocation or a payment status.</p>}
        </div>}

        <details className={`${styles.calculationDetails} mt-6`} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary ref={detailsSummaryRef} className={styles.calculationSummary}><span>Review or change details</span><span className={styles.calculationChevron} aria-hidden="true">⌄</span></summary>
          <form className="mt-4" onSubmit={calculate}>
          <fieldset className={styles.manualFieldset}>
            <legend className="px-1 font-medium text-ink">Estimate details</legend>
            {result?.kind === "unsupported" && <p ref={detailsErrorRef} tabIndex={-1} role="alert" className="mt-3 rounded-md border-l-2 border-l-accent bg-surface p-3 text-sm leading-relaxed text-ink">{result.reason}</p>}
            {selectedProperty && <p ref={detailsStatusRef} tabIndex={-1} className="mt-2 text-xs leading-relaxed text-ink-secondary">PIN {selectedProperty.pin} · District {propertyRecord?.district ?? "not available"} · {propertyRecord ? propertyRecord.taxableMarketValue === null ? "Taxable market value not provided" : `Taxable market value ${formatDollars(propertyRecord.taxableMarketValue)}` : "Tax-year record not available"}{propertyRecord?.assessmentClass ? ` · Assessment class ${propertyRecord.assessmentClass}` : ""}</p>}
            <div className={`${styles.manualFields} mt-4`}>
              <label className="block text-sm font-medium text-ink">Tax district<select ref={districtInputRef} value={districtCode} onChange={(event) => { cancelRecordForInputEdit(); setDistrictCode(event.target.value); invalidateCalculation(); }} className="mt-2 min-h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-ink"><option value="">Choose a district</option>{districts.map((district) => <option key={district.code} value={district.code}>{district.code} — {district.cityName || "County area"}</option>)}</select></label>
              <label className="block text-sm font-medium text-ink">2025 taxable market value<input ref={taxableValueInputRef} inputMode="decimal" value={taxableValue} onChange={(event) => { cancelRecordForInputEdit(); setTaxableValue(event.target.value); invalidateCalculation(); }} placeholder="300000" className="mt-2 min-h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 font-mono tabular-nums text-ink" /><span className="mt-1 block text-xs font-normal leading-relaxed text-ink-secondary">Use Taxable Market Value on your 2025 record; current GIS may differ. Do not use a listing price.</span></label>
              <label className="block text-sm font-medium text-ink">Is this your primary home?<select ref={assessmentRatioInputRef} value={assessmentRatio} onChange={(event) => { cancelRecordForInputEdit(); setAssessmentRatio(event.target.value === "" ? "" : Number(event.target.value) as 4 | 6); invalidateCalculation(); }} className="mt-2 min-h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-ink"><option value="">Choose one</option><option value="4">Yes, I live here (4% legal residence)</option><option value="6">No: rental, second home or business (6%)</option></select></label>
              <label className="block text-sm font-medium text-ink">Homestead exemption (age 65+, disabled or legally blind)<select ref={homesteadInputRef} value={homestead} onChange={(event) => { cancelRecordForInputEdit(); setHomestead(event.target.value as "" | "yes" | "no"); invalidateCalculation(); }} className="mt-2 min-h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-ink"><option value="">Choose yes or no</option><option value="yes">Yes</option><option value="no">No</option></select><span className="mt-1 block text-xs font-normal leading-relaxed text-ink-secondary">Separate from legal residence. Choose yes only if your Homestead exemption is approved on the 2025 record.</span></label>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-secondary">Use the assessment shown on your 2025 record. Mixed 4%/6% assessments, agricultural property and special tax arrangements are not supported.</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">One mill means $1 of tax per $1,000 of assessed value.</p>
            <button type="submit" className="mt-5 min-h-11 rounded-md bg-ink px-5 py-2.5 font-medium text-white hover:bg-ink/90">Calculate estimate</button>
            {selectedDistrict && <p className="mt-3 text-xs leading-relaxed text-ink-secondary">District source: tax year {taxData.taxYear}, p.{selectedDistrict.sourcePage}. Rates were verified {taxData.verifiedOn}.</p>}
          </fieldset>
          </form>
        </details>
      </section>

      {result && (
        <section className="border-t border-hairline pt-8" aria-labelledby="tax-result-title" aria-live="polite">
          <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">Estimate · tax year {taxData.taxYear}</p>
          <h2 id="tax-result-title" ref={resultHeadingRef} tabIndex={-1} className="mt-2 font-display text-3xl font-semibold tracking-tight">Where the estimate goes</h2>
          {result.kind === "unsupported" ? (
            <p className="mt-4 rounded-md border-l-2 border-l-accent bg-surface p-4 text-sm leading-relaxed text-ink">{result.reason}</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-ink-secondary">Estimated total before fees and other credits: <strong className="mt-1 block font-mono text-4xl font-medium tabular-nums text-ink">{formatDollars(result.total)}</strong></p>
              <p className="mt-3 text-sm text-ink-secondary">Assessment used for this estimate: <span className="font-mono tabular-nums text-ink">{formatDollars(result.assessedValue)}</span>.</p>
              <figure data-viz aria-labelledby="tax-allocation-caption" className="mt-5">
                {result.total <= 0 ? <p className={styles.emptyAllocation}>No payable tax in this estimate.</p> : <div className={styles.stackedAllocation} role="group" aria-label="All estimated tax recipients">
                  {sortAllocationLines(result.lines).map((line, index) => {
                    const share = result.total > 0 ? (line.amount / result.total) * 100 : 0;
                    if (share <= 0) return null;
                    const selected = selectedLine?.id === line.id;
                    return <button key={line.id} type="button" className={styles.stackedSegment} data-active={selected} style={{ width: `${share}%`, backgroundColor: colorForAllocation(line.id) }} aria-label={`${line.label}: ${formatDollars(line.amount)}, ${share.toFixed(1)}%`} title={`${line.label}: ${formatDollars(line.amount)} (${share.toFixed(1)}%)`} aria-pressed={selected} aria-expanded={selected} aria-controls={selected ? `tax-detail-${line.id}` : undefined} onClick={() => selectAllocationFromChart(line)}>{share >= 8 && <span aria-hidden="true">{index + 1}</span>}</button>;
                  })}
                </div>}
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-md border border-hairline bg-surface px-3 py-2"><span className="text-ink-secondary">County operations &amp; debt</span> <strong className="ml-2 font-mono tabular-nums text-ink">{formatDollars(result.countyTotal)}</strong>{result.total > 0 && <span className="mt-1 block text-xs text-ink-secondary">{(result.countyTotal / result.total * 100).toFixed(1)}% of this estimate</span>}</p>
                  <p className="rounded-md border border-hairline bg-surface px-3 py-2"><span className="text-ink-secondary">Other taxing entities</span> <strong className="ml-2 font-mono tabular-nums text-ink">{formatDollars(result.otherTotal)}</strong>{result.total > 0 && <span className="mt-1 block text-xs text-ink-secondary">{(result.otherTotal / result.total * 100).toFixed(1)}% of this estimate</span>}</p>
                </div>
                <p className="mt-5 mb-3 text-sm text-ink-secondary">Largest to smallest. Select a segment or recipient to see what its levy supports.</p>
                <AllocationList lines={result.lines} total={result.total} selectedId={selectedLine?.id ?? null} onSelect={(line) => setSelectedLine(selectedLine?.id === line.id ? null : line)} />
                <figcaption id="tax-allocation-caption" className="mt-3 text-sm leading-relaxed text-ink-secondary">Estimated allocation for tax year {result.taxYear}. Select any row to learn more. Each bar shows its share of the estimate.</figcaption>
                <details className="mt-4 border-t border-hairline pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-accent underline decoration-dotted underline-offset-2">View estimate as a table</summary>
                  <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable estimated allocation table">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Estimated property-tax allocation by taxing entity</caption>
                      <thead><tr className="border-b border-hairline text-left"><th scope="col" className="py-2 pr-3 font-medium">Recipient</th><th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th><th scope="col" className="py-2 text-right font-medium">Mills</th></tr></thead>
                      <tbody>{sortAllocationLines(result.lines).map((line) => <tr key={line.id} className="border-b border-hairline"><th scope="row" className="py-2 pr-3 text-left font-normal">{line.label}</th><td className="py-2 pr-3 text-right font-mono tabular-nums">{formatDollars(line.amount)}</td><td className="py-2 text-right font-mono tabular-nums">{line.mills}</td></tr>)}<tr className="border-t-2 border-ink"><th scope="row" className="py-2 pr-3 text-left font-semibold">Estimated total</th><td className="py-2 pr-3 text-right font-mono font-semibold tabular-nums">{formatDollars(result.total)}</td><td className="py-2 text-right">—</td></tr></tbody>
                    </table>
                  </div>
                </details>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {calculationInput && <a href={estimateCsvHref(result, calculationInput)} download={`property-tax-estimate-${result.taxYear}.csv`} className="font-medium text-accent underline decoration-dotted underline-offset-2">Download this estimate (CSV)</a>}
                  <a href={taxData.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-accent underline decoration-dotted underline-offset-2">View verified rate source</a>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-secondary">2025 millage sheet, pp. 1–4; rates checked {taxData.verifiedOn}.</p>
                <details className="mt-2 text-xs text-ink-secondary">
                  <summary className="cursor-pointer underline decoration-dotted underline-offset-2">Technical source details</summary>
                  <p className="mt-2 break-all">Source file hash: {taxData.sourceSha256}</p>
                </details>
                <p className="mt-3 text-xs"><a href="https://www.greenvillecounty.org/appsas400/votaxqry/Default.aspx" target="_blank" rel="noreferrer" className="text-accent underline decoration-dotted underline-offset-2">Search the official tax bill or account →</a></p>
              </figure>
              {result.schoolRelief > 0 && <p className="mt-4 rounded-md border-l-2 border-l-accent bg-surface p-3 text-sm leading-relaxed text-ink-secondary">The estimate applies <span className="font-mono tabular-nums text-ink">{formatDollars(result.schoolRelief)}</span> of school-operations relief before calculating the lines shown. It is already reflected in the estimate and is not an extra charge.</p>}
              <p className="mt-5 text-xs leading-relaxed text-ink-secondary">The county portion is one source of county money. County budgets also use fees, aid, transfers, and other sources. This estimate is not the official bill.</p>
              <PersonalTaxServiceBridge budgetYear={budgetYear} taxYear={result.taxYear} />
              <p className="mt-2 text-xs"><Link href="/methodology/#property-tax" className="text-accent underline underline-offset-2">How this estimate is calculated and what it excludes</Link></p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
