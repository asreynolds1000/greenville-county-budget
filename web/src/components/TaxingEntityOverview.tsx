"use client";

import { useState } from "react";

import styles from "./PropertyTaxExplorer.module.css";

type OverviewTopic = "county" | "schools" | "municipality" | "special" | "agencies";

const OVERVIEW_TOPICS: Array<{ id: OverviewTopic; label: string; detail: string; explanation: string }> = [
  { id: "county", label: "County government", detail: "General operations and county debt", explanation: "This is the portion for general county operations and debt. The Auditor's broader County column also includes separate library, technical college and art museum levies; we show those recipients separately." },
  { id: "schools", label: "School district", detail: "School operations and debt", explanation: "School operations and school debt are separate lines. A school-operations relief rule may remove part of the estimate while school debt remains. The district can be Greenville, Anderson, or Spartanburg depending on the parcel." },
  { id: "municipality", label: "City or town", detail: "Only where the parcel is inside one", explanation: "A city or town line applies only inside that municipality. It is a separate levy from Greenville County and Greenville County Schools." },
  { id: "special", label: "Special districts", detail: "Fire, sanitation, arena, and other districts", explanation: "Fire, sanitation, arena, and other special-district lines apply only where the parcel is inside that district." },
  { id: "agencies", label: "Library, college & museum", detail: "Separate levies in the County column", explanation: "The library system, Greenville Technical College and art museum have their own levies. These are shown separately from general county operations and debt, even though the rate sheet includes them in its County column." },
];

export function TaxingEntityOverview({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<OverviewTopic | null>(null);
  const topic = OVERVIEW_TOPICS.find((item) => item.id === selected);

  return (
    <div className={styles.overviewWrapper}>
      <p className="mb-2 text-center text-sm font-medium text-ink">Your property-tax payment</p>
      <p aria-hidden="true" className="mb-2 text-center text-accent">↓</p>
      <div className={styles.overview} role="group" aria-label="Taxing entities that may appear on one property-tax bill">
        {OVERVIEW_TOPICS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.overviewButton}
            data-active={selected === item.id}
            aria-pressed={selected === item.id}
            onClick={() => setSelected(selected === item.id ? null : item.id)}
          >
            <span className={styles.overviewLabel}>{item.label}</span>
            <span className={styles.overviewDetail}>{item.detail}</span>
          </button>
        ))}
      </div>
      {topic && (
        <p className="mt-3 rounded-md border-l-2 border-l-accent bg-surface p-3 text-sm leading-relaxed text-ink-secondary" role="status">
          <strong className="font-medium text-ink">{topic.label}.</strong> {topic.explanation}
        </p>
      )}
      {!compact && (
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          These boxes show possible recipients. Their sizes do not represent shares of the
          county budget or your tax bill.
        </p>
      )}
      {!compact && <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
        The <a href="https://www.greenvillecounty.org/Treasurer/" target="_blank" rel="noreferrer" className="text-accent underline decoration-dotted underline-offset-2">Treasurer</a> collects and disburses taxes; the <a href="https://www.greenvillecounty.org/Auditor/" target="_blank" rel="noreferrer" className="text-accent underline decoration-dotted underline-offset-2">Auditor</a> prepares bills and compiles the taxing authorities&rsquo; rates.
      </p>}
    </div>
  );
}
