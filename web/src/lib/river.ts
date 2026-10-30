import type { ProvenanceSource } from "@/components/Provenance";
import type { PrintedForm } from "@/lib/schema";

/** A cited, serializable node for a fund-flow figure. */
export type RiverNode = {
  id: string;
  label: string;
  /** Retain the accounting category when a source-backed service label leads. */
  officialLabel?: string;
  /** Published, year-valid children; examples are part of the parent, not extra spending. */
  serviceExamples?: Array<RiverNode & { href: string }>;
  context?: {
    title: string;
    summary: string;
    sources: Array<{ label: string; href: string }>;
  };
  value: number;
  printedForm: PrintedForm | null;
  kind: "revenue" | "transfer" | "reserve" | "use" | "fund";
  href: string | null;
  description: string;
  citation: {
    sourceUrl: string;
    sourceCode: string;
    printedPage: number | null;
    pdfPage: number | null;
  };
  color: string;
};

/**
 * One reconciliation-safe view. A county model is a four-fund authority
 * allocation; its empty sources array means no consolidated county revenue
 * statement is being implied. A General Fund model is a true source/use flow.
 */
export type RiverModel = {
  id: "county" | "general";
  fiscalYear: number;
  title: string;
  authority: number;
  centerLabel: string;
  sources: RiverNode[];
  uses: RiverNode[];
  reserve: RiverNode | null;
  sourceTotal: number | null;
  coverageNote: string | null;
  source: ProvenanceSource;
};
