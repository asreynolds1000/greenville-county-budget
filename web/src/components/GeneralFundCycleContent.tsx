import { FUND_BALANCE_CONTEXT } from "@/lib/readingContext";
import type { ReactNode } from "react";
import { hasFundYear, type FundCommon, type GeneralFundInput } from "@/lib/fundPanelData";
import Link from "@/components/AppLink";
import { FundEntityYearLink as EntityYearLink } from "@/components/FundEntityYearLink";
import { ReportErrorLink } from "@/components/ReportErrorLink";
import { sourceCoversFiscalYear } from "@/lib/sourceYears";

import { Amount } from "@/components/Amount";
import { StatusBadge } from "@/components/StatusBadge";
import { NoteFootnotes, NoteMark, numberNotes } from "@/components/DataNotes";
import { MobileFiscalYearSelect } from "@/components/MobileFiscalYearSelect";
import type { DataNote, PrintedForm } from "@/lib/schema";
import { allocateShares, formatShare } from "@/lib/shares";
import type { GeneralFundBudgetActualComparison, V2Statement } from "@/lib/schema";
import { displayName, formatAmount } from "@/lib/format";

type StatementInstance = V2Statement["instances"][number];
type ResolvedMember = StatementInstance["members"][number];
type Citation = ResolvedMember["citation"];

/** Small counts read better spelled out in prose than as numerals. */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];

function spellCount(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

const REVENUE_COMPONENT_IDS = [
  "rev.property-taxes",
  "rev.county-offices",
  "rev.intergovernmental",
  "rev.other",
];
const IN_COLORS = ["#00795a", "#3c9b7e", "#76bca7", "#b6d9cf"];
// OUT_COLORS is gone with the money-out composition bar it coloured. The two remaining
// bars are money-IN compositions of four revenue categories, which is a genuine
// composition of peers — not a two-line split whose segments can be read against the
// wrong row.

type VisualDatum = {
  entityId: string;
  label: string;
  value: number;
  printedForm: PrintedForm | null;
};

function memberById(instance: StatementInstance | null, entityId: string): ResolvedMember | null {
  return instance?.members.find((member) => member.entity_id === entityId) ?? null;
}

function plainStatus(statusClass: string | null): string {
  if (!statusClass) return "Not published";
  return statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
}

function percent(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(value / total < 0.1 ? 1 : 0)}%`;
}

function compactDollars(value: number | null): string {
  if (value === null) return "Not published";
  // Compact notation renders exact zero as "$0.0", which reads as a rounding artifact rather
  // than the real figure it is. FY2014's budget start estimate needed no revision at all.
  if (value === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    // ICU versions disagree on this implicit default; keep SSR and hydration identical.
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function reconcileBudgetBookToActualEnding({
  plannedBeginning,
  plannedChange,
  plannedAdjustment,
  plannedEnding,
  actualBeginning,
  actualChange,
  actualAdjustment,
  actualEnding,
}: {
  plannedBeginning: number | null;
  plannedChange: number | null;
  plannedAdjustment: number | null;
  plannedEnding: number | null;
  actualBeginning: number | null;
  actualChange: number | null;
  actualAdjustment: number | null;
  actualEnding: number | null;
}) {
  if (plannedBeginning === null || plannedChange === null || plannedEnding === null
    || actualBeginning === null || actualChange === null || actualEnding === null) return null;
  // An omitted adjustment is treated as zero only after the statement reconciles without it.
  // This is a validation, not a manufactured zero for a missing published operand.
  const planAdjustment = plannedAdjustment ?? 0;
  const auditAdjustment = actualAdjustment ?? 0;
  if (plannedBeginning + plannedChange + planAdjustment !== plannedEnding
    || actualBeginning + actualChange + auditAdjustment !== actualEnding) return null;
  const startRevision = actualBeginning - plannedBeginning;
  const resultRevision = actualChange - plannedChange;
  return {
    startRevision,
    resultRevision,
    planAdjustment,
    auditAdjustment,
    ending: plannedEnding + startRevision + resultRevision - planAdjustment + auditAdjustment,
  };
}

/**
 * ResultStory intentionally renders only a four-term cash-flow equation. Do not use it for
 * a published position that needs a separate adjustment: that would make the visible equation
 * claim that beginning balance plus net change equals ending balance when the source says it
 * does not. The fuller ledger and bridge below retain those source-printed adjustments.
 */
export function canRenderResultStories({
  plannedBeginning,
  plannedChange,
  plannedEnding,
  actualBeginning,
  actualChange,
  actualEnding,
  plannedMoneyIn,
  plannedMoneyOut,
  actualMoneyIn,
  actualMoneyOut,
}: {
  plannedBeginning: number | null;
  plannedChange: number | null;
  plannedEnding: number | null;
  actualBeginning: number | null;
  actualChange: number | null;
  actualEnding: number | null;
  plannedMoneyIn: number | null;
  plannedMoneyOut: number | null;
  actualMoneyIn: number | null;
  actualMoneyOut: number | null;
}): boolean {
  if (plannedBeginning === null || plannedChange === null || plannedEnding === null
    || actualBeginning === null || actualChange === null || actualEnding === null
    || plannedMoneyIn === null || plannedMoneyOut === null
    || actualMoneyIn === null || actualMoneyOut === null) return false;
  return plannedMoneyIn - plannedMoneyOut === plannedChange
    && actualMoneyIn - actualMoneyOut === actualChange
    && plannedBeginning + plannedChange === plannedEnding
    && actualBeginning + actualChange === actualEnding;
}

function CompositionBar({
  items,
  total,
  colors,
  label,
}: {
  items: VisualDatum[];
  total: number;
  colors: string[];
  label: string;
}) {
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-hairline"
      role="img"
      aria-label={`${label}: ${items.map((item) => `${item.label} ${percent(item.value, total)}`).join(", ")}`}
    >
      {items.filter((item) => item.value > 0).map((item, index) => (
        <span
          key={item.entityId}
          style={{ width: `${(item.value / total) * 100}%`, backgroundColor: colors[index % colors.length] }}
          title={`${item.label}: ${percent(item.value, total)}`}
        />
      ))}
    </div>
  );
}

function RankedDetail({ common,
  member,
  total,
  color,
  year,
}: { common: FundCommon;
  member: ResolvedMember;
  total: number;
  color: string;
  year: number;
}) {
  const entity = common.entities[member.entity_id];
  const value = member.value ?? 0;
  const label = entity ? displayName(entity) : member.entity_id;
  const detailAvailable = hasFundYear(common, member.entity_id, year);
  const detail = (
    <>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className={detailAvailable ? "underline decoration-hairline underline-offset-4" : undefined}>{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <Amount value={value} printedForm={member.printed_form} />
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline">
        <span
          className="block h-full rounded-full"
          style={{ width: `${total === 0 ? 0 : (value / total) * 100}%`, backgroundColor: color }}
        />
      </div>
    </>
  );
  return (
    <li>
      {detailAvailable ? (
        <Link
          href={`/e/${member.entity_id}/?fy=${year}`}
          aria-label={`Explore ${label}, FY${year}`}
          className="block min-h-11 rounded px-1 py-2.5 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {detail}
        </Link>
      ) : (
        <div className="min-h-11 px-1 py-2.5">{detail}</div>
      )}
    </li>
  );
}

/**
 * A source citation, with an explanation when the cited document is not the year's own.
 *
 * Where two books print a figure for the same year, the later one wins, so an FY2025 figure
 * can legitimately cite the FY2026 budget book. Rendered bare, "FY2026, p.35" under an
 * FY2025 number reads as a mistake to an attentive reader, which is exactly the reader this
 * site is for.
 */
function CitationLink({ common, citation, pageYear }: { common: FundCommon; citation: Citation; pageYear?: number }) {
  if (!citation) return null;
  const source = common.sources[citation.source_code];
  const page = citation.printed_page !== null ? `, p.${citation.printed_page}` : "";
  const isLaterBook = pageYear !== undefined && !sourceCoversFiscalYear(citation.source_code, pageYear);
  const label = source?.document_title_version ?? citation.source_code;
  return (
    <a
      href={`${citation.source_url}${citation.pdf_page ? `#page=${citation.pdf_page}` : ""}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-accent"
      title={
        isLaterBook
          ? `${label}. This FY${pageYear} figure is cited to a later book, which is the most `
            + `recent official printing of it.`
          : label
      }
    >
      {isLaterBook ? "as printed in " : ""}{citation.source_code}{page}
    </a>
  );
}

function SourceLink({ common,
  member,
  pageYear,
}: { common: FundCommon;
  member: ResolvedMember | null;
  pageYear?: number;
}) {
  return <CitationLink common={common} citation={member?.citation ?? null} pageYear={pageYear} />;
}

function StatementLine({ common,
  member,
  label,
  value,
  detail,
  emphasis = false,
  fiscalYear,
  share,
}: { common: FundCommon;
  member: ResolvedMember | null;
  label: string;
  value?: number | null;
  detail?: string;
  emphasis?: boolean;
  fiscalYear: number;
  /**
   * This line's share of its section total, already formatted.
   *
   * Attached to the line rather than drawn as a bar beneath the section. A composition bar
   * sat directly under "Transfers out", so its 97% operations segment read as describing
   * the 3% figure immediately above it — the text said one thing and the picture said the
   * opposite (owner walkthrough, 2026-07-22). A percentage next to its own amount cannot
   * be misattributed to a different line.
   */
  share?: string;
}) {
  const shownValue = value === undefined ? (member?.value ?? null) : value;
  const shownPrintedForm = value === undefined ? (member?.printed_form ?? null) : null;
  const href = member ? `/e/${member.entity_id}/?fy=${fiscalYear}` : null;
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 ${
        emphasis ? "border-t border-ink/20 font-medium" : "border-t border-hairline"
      }`}
    >
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="underline decoration-hairline underline-offset-4 hover:text-accent">
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
        {detail && <p className="mt-1 text-xs font-normal leading-relaxed text-ink-secondary">{detail}</p>}
      </div>
      <span className="text-right">
        <span className="font-mono tabular-nums">
          <Amount value={shownValue} printedForm={shownPrintedForm} />
        </span>
        {share && (
          <span className="mt-0.5 block font-mono text-[11px] font-normal tabular-nums text-ink-secondary">
            {share}
          </span>
        )}
      </span>
      <div className="col-span-2 flex items-center gap-2">
        {member?.resolved_status_class && (
          <span className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
            {plainStatus(member.resolved_status_class)}
          </span>
        )}
        <SourceLink common={common} member={member} />
      </div>
    </li>
  );
}

function CycleSection({
  id,
  eyebrow,
  title,
  description,
  tone,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  tone: "in" | "out";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`cycle-card cycle-card-${tone} scroll-mt-4`}>
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-secondary uppercase">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 min-h-16 text-sm leading-relaxed text-ink-secondary">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BalanceFlowStep({ common,
  eyebrow,
  label,
  detail,
  value,
  member,
  tone,
}: { common: FundCommon;
  eyebrow: string;
  label: string;
  detail: string;
  value: number | null;
  member: ResolvedMember | null;
  tone: "beginning" | "in" | "out" | "adjustment" | "ending";
}) {
  return (
    <article className={`balance-flow-step balance-flow-step-${tone}`}>
      <p className="balance-flow-step-eyebrow font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
        {eyebrow}
      </p>
      <h3 className="balance-flow-step-label mt-2 text-sm font-medium text-ink">{label}</h3>
      <p className="balance-flow-step-value mt-2 font-display text-2xl font-semibold tracking-tight tabular-nums">
        <Amount value={value} printedForm={member?.printed_form ?? null} />
      </p>
      {/* Suppressed on phones by globals.css, not dropped from the markup: the same
          explanation is restated in the flow-comparison block immediately below, and four
          repetitions of a two-line paragraph is most of what made this page 7,700px tall.
          It stays in the DOM so a screen reader still reaches it. */}
      <p className="balance-flow-step-detail mt-2 text-xs leading-relaxed text-ink-secondary">
        {detail}
      </p>
      <div className="balance-flow-step-source mt-2"><SourceLink common={common} member={member} /></div>
    </article>
  );
}

function BalanceFlowOperator({ symbol, label }: { symbol: "+" | "−" | "="; label: string }) {
  return (
    <div className="balance-flow-operator" aria-label={label} role="img">
      {symbol}
    </div>
  );
}

/**
 * A bar in a contribution list. Only `label` and `contribution` are required, because the
 * top-level plan-versus-result bars are derived figures with no single source line behind
 * them: they have no budget, no actual, and no page to cite. Requiring those fields forced
 * an earlier version to invent zeros and hardcode FY2025 page numbers to satisfy the type.
 * A row that carries the optional fields gets its values and source link rendered; a row
 * that does not, does not.
 */
type ContributionRow = {
  label: string;
  canonical_key?: string;
  contribution: number;
  /**
   * The value column's text: the item's effect on fund balance ("$10,070,841 from
   * fund balance") for the four performance-vs-budget bars and the calculated remainder, or a
   * short over/under-budget suffix ("$6.3M over budget") for a per-category driver row.
   * Always spells out the direction in words and never prints a bare signed number, because
   * a bare "-$10.1M" next to a bar reading the opposite direction from the budget-vs-actual
   * table above it read as a contradiction to two resident testers.
   */
  effectText: string;
  budget?: number;
  actual?: number;
  printed_page?: number;
  pdf_page?: number;
};

type BudgetActualRow = {
  label: string;
  budget: number;
  actual: number;
  budgetPrintedForm: PrintedForm | null;
  actualPrintedForm: PrintedForm | null;
  printed_page: number;
  pdf_page: number;
};

type AuditedBudgetActualRows = {
  moneyIn: BudgetActualRow[];
  moneyOut: BudgetActualRow[];
  finalBudgetNetChange: number;
  actualNetChange: number;
};

/**
 * The ACFR compares its audited result with the final amended budget, not the original
 * adoption or the separate budget-book plan. Keep the signed transfer-out source value until
 * forming Money Out, where residents read it as an amount leaving the fund.
 */
export function auditedBudgetActualRows(
  comparison: GeneralFundBudgetActualComparison,
): AuditedBudgetActualRows {
  const totals = comparison.totals;
  const totalMoneyIn = {
    budget: totals.total_revenues.budget + totals.transfers_in.budget,
    actual: totals.total_revenues.actual + totals.transfers_in.actual,
  };
  const totalMoneyOut = {
    budget: totals.total_expenditures.budget + Math.abs(totals.transfers_out.budget),
    actual: totals.total_expenditures.actual + Math.abs(totals.transfers_out.actual),
  };
  return {
    moneyIn: [
      {
        label: "Revenue",
        budget: totals.total_revenues.budget,
        actual: totals.total_revenues.actual,
        budgetPrintedForm: totals.total_revenues.budget_printed_form,
        actualPrintedForm: totals.total_revenues.actual_printed_form,
        printed_page: totals.total_revenues.printed_page,
        pdf_page: totals.total_revenues.pdf_page,
      },
      {
        label: "Transfers in",
        budget: totals.transfers_in.budget,
        actual: totals.transfers_in.actual,
        budgetPrintedForm: totals.transfers_in.budget_printed_form,
        actualPrintedForm: totals.transfers_in.actual_printed_form,
        printed_page: totals.transfers_in.printed_page,
        pdf_page: totals.transfers_in.pdf_page,
      },
      {
        label: "Total money in",
        ...totalMoneyIn,
        budgetPrintedForm: null,
        actualPrintedForm: null,
        printed_page: totals.net_change.printed_page,
        pdf_page: totals.net_change.pdf_page,
      },
    ],
    moneyOut: [
      {
        label: "Operating spending",
        budget: totals.total_expenditures.budget,
        actual: totals.total_expenditures.actual,
        budgetPrintedForm: totals.total_expenditures.budget_printed_form,
        actualPrintedForm: totals.total_expenditures.actual_printed_form,
        printed_page: totals.total_expenditures.printed_page,
        pdf_page: totals.total_expenditures.pdf_page,
      },
      {
        label: "Transfers out",
        budget: Math.abs(totals.transfers_out.budget),
        actual: Math.abs(totals.transfers_out.actual),
        budgetPrintedForm: totals.transfers_out.budget_printed_form,
        actualPrintedForm: totals.transfers_out.actual_printed_form,
        printed_page: totals.transfers_out.printed_page,
        pdf_page: totals.transfers_out.pdf_page,
      },
      {
        label: "Total money out",
        ...totalMoneyOut,
        budgetPrintedForm: null,
        actualPrintedForm: null,
        printed_page: totals.net_change.printed_page,
        pdf_page: totals.net_change.pdf_page,
      },
    ],
    finalBudgetNetChange: totals.net_change.budget,
    actualNetChange: totals.net_change.actual,
  };
}

function ComparisonSourceLink({
  comparison,
  printedPage,
  pdfPage,
}: {
  comparison: GeneralFundBudgetActualComparison;
  printedPage?: number;
  pdfPage?: number;
}) {
  // Summary amounts draw on the whole annual comparison schedule, including transfers
  // after the service detail. Its pages vary by edition; FY2025's pages are not a template.
  const scheduleRows = [...comparison.revenue_categories, ...comparison.spending_categories]
    .sort((left, right) => left.printed_page - right.printed_page);
  const first = scheduleRows[0];
  const last = scheduleRows.at(-1);
  const pageLabel = printedPage !== undefined
    ? `, p.${printedPage}`
    : first && last
      ? first.printed_page === last.printed_page
        ? `, p.${first.printed_page}`
        : `, pp.${first.printed_page}–${last.printed_page}`
      : "";
  const targetPage = pdfPage ?? (printedPage === undefined ? first?.pdf_page : undefined);
  return (
    <a
      href={`${comparison.source.source_url}${targetPage ? `#page=${targetPage}` : ""}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-accent"
      title={comparison.source.document_title_version}
    >
      {comparison.source.source_code}{pageLabel}
    </a>
  );
}

function ResultStory({
  label,
  beginning,
  moneyIn,
  moneyOut,
  change,
  ending,
  beginningPrintedForm,
  endingPrintedForm,
  source,
  tone,
}: {
  label: string;
  beginning: number;
  moneyIn: number;
  moneyOut: number;
  change: number;
  ending: number;
  beginningPrintedForm: PrintedForm | null;
  endingPrintedForm: PrintedForm | null;
  source: React.ReactNode;
  tone: "budget" | "actual";
}) {
  return (
    <article className={`result-story result-story-${tone}`}>
      <div className="result-story-heading">
        <div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">{label}</p>
          <h4 className="mt-1 font-display text-xl font-semibold tracking-tight">
            {tone === "budget"
              ? change < 0 ? "Planned to use " : "Planned to add "
              : change < 0 ? "Used " : "Added "}
            {compactDollars(Math.abs(change))} {change < 0 ? "of" : "to"} fund balance
          </h4>
        </div>
        {source}
      </div>
      <div className="result-story-equation" aria-label={`${label} General Fund flow`}>
        <div><small>Starts</small><strong><Amount value={beginning} printedForm={beginningPrintedForm} /></strong></div>
        <b aria-hidden="true">+</b>
        <div><small>Money in</small><strong><Amount value={moneyIn} printedForm={null} /></strong></div>
        <b aria-hidden="true">−</b>
        <div><small>Money out</small><strong><Amount value={moneyOut} printedForm={null} /></strong></div>
        <b aria-hidden="true">=</b>
        <div><small>Ends</small><strong><Amount value={ending} printedForm={endingPrintedForm} /></strong></div>
      </div>
    </article>
  );
}

function ContributionBar({ value, maximum }: { value: number; maximum: number }) {
  const width = maximum === 0 ? 0 : (Math.abs(value) / maximum) * 50;
  return (
    <div className="contribution-track" aria-hidden="true">
      <span className="contribution-axis" />
      <span
        className={`contribution-bar ${value >= 0 ? "contribution-bar-positive" : "contribution-bar-negative"}`}
        style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

function ContributionRows({
  items,
  lineNotes = {},
  numbering,
  maximum,
  comparison,
  showValues = false,
}: {
  items: ContributionRow[];
  lineNotes?: Record<string, DataNote[]>;
  numbering: Map<string, number>;
  maximum: number;
  comparison: GeneralFundBudgetActualComparison;
  showValues?: boolean;
}) {
  return (
    <ul className="contribution-list">
      {items.map((item) => (
        <li key={item.label} className="contribution-row">
          <div className="contribution-label">
            <span>
              {item.label}
              <NoteMark notes={lineNotes[item.canonical_key ?? ""] ?? []} numbering={numbering} />
            </span>
            <strong className={item.contribution >= 0 ? "text-[#00795a]" : "text-[#b23a24]"}>
              {item.effectText}
            </strong>
          </div>
          <ContributionBar value={item.contribution} maximum={maximum} />
          {showValues
            && item.budget !== undefined
            && item.actual !== undefined
            && item.printed_page !== undefined && (
            <div className="contribution-values">
              <span>Budget <Amount value={item.budget} printedForm={null} /></span>
              <span>Actual <Amount value={item.actual} printedForm={null} /></span>
              <ComparisonSourceLink comparison={comparison} printedPage={item.printed_page} pdfPage={item.pdf_page} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function BudgetActualRows({
  rows,
  totalLabel,
}: {
  rows: BudgetActualRow[];
  totalLabel: string;
}) {
  return (
      <div className="budget-actual-lines">
      <div className="budget-actual-line budget-actual-line-head" aria-hidden="true">
        <span>{totalLabel}</span><span>Final amended budget</span><span>Audited actual</span><span>Difference</span>
      </div>
      {rows.map((row, index) => {
        const difference = row.actual - row.budget;
        return (
          <div key={row.label} className={`budget-actual-line ${index === rows.length - 1 ? "budget-actual-line-total" : ""}`}>
            <strong>{row.label}</strong>
            <span data-label="Final amended budget"><Amount value={row.budget} printedForm={row.budgetPrintedForm} /></span>
            <span data-label="Audited actual"><Amount value={row.actual} printedForm={row.actualPrintedForm} /></span>
            <span data-label="Difference" className="budget-actual-difference">
              {`${difference >= 0 ? "+" : ""}${formatAmount(difference)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type PerformanceEffectKind = "revenue" | "spending" | "transfers-in" | "transfers-out";

const PERFORMANCE_EFFECT_SUBJECTS: Record<PerformanceEffectKind, string> = {
  revenue: "Revenue",
  spending: "Spending",
  "transfers-in": "Transfers in",
  "transfers-out": "Transfers out",
};

/**
 * How one line of the audited-vs-final-budget comparison moved the fund's ending balance.
 *
 * The Money In / Money Out tables above already show each item as an actual-versus-budget
 * difference. The bars below plot the same fact as an effect on fund balance, and `contribution`
 * is already signed so positive always means "added to the fund's ending balance" (see the
 * sign-convention comments where each total is computed). Rendering both readings in one
 * sentence -- "Spending ran over budget / $X from fund balance" -- keeps the two tellings from
 * reading as a contradiction, which is what happened when the bar showed only a bare signed
 * number and two resident testers read it as reversing the table above it.
 */
function describePerformanceEffect(
  kind: PerformanceEffectKind,
  contribution: number,
): { label: string; effectText: string } {
  const amount = formatAmount(Math.abs(contribution));
  const addsToSavings = contribution >= 0;
  if (contribution === 0) {
    return {
      label: `${PERFORMANCE_EFFECT_SUBJECTS[kind]} matched the final budget`,
      effectText: "no change to fund balance",
    };
  }
  const verbPhrase = kind === "spending"
    ? addsToSavings ? "came in under budget" : "ran over budget"
    : kind === "transfers-out"
      ? addsToSavings ? "came in below budget" : "came in above budget"
      : addsToSavings ? "came in above budget" : "came in below budget";
  return {
    label: `${PERFORMANCE_EFFECT_SUBJECTS[kind]} ${verbPhrase}`,
    effectText: `${amount} ${addsToSavings ? "to" : "from"} fund balance`,
  };
}

/** Same convention as `describePerformanceEffect`, for the one line with no budget of its own. */
function describeRemainderEffect(contribution: number): { label: string; effectText: string } {
  const amount = formatAmount(Math.abs(contribution));
  const addsToSavings = contribution >= 0;
  return {
    label: `Calculated remainder ${addsToSavings ? `added ${amount} to fund balance` : `reduced fund balance by ${amount}`}`,
    effectText: `${amount} ${addsToSavings ? "to" : "from"} fund balance`,
  };
}

/**
 * The remainder, named by the audited report's own other-financing line(s) when those lines
 * account for it exactly: "Issuance of leases" rather than "calculated remainder". A
 * final-budget component (FY2011's fund balance appropriation) enters with its sign flipped,
 * because the bars compare actual against final budget.
 */
function describeNamedResidualEffect(
  components: Array<{ column: "actual" | "final_budget"; label: string; amount: number }>,
  contribution: number,
): { label: string; effectText: string } {
  const amount = formatAmount(Math.abs(contribution));
  const names = components.map((component) =>
    component.column === "final_budget" ? `${component.label} (final budget)` : component.label,
  );
  return {
    label: names.join(" and "),
    effectText: `${amount} ${contribution >= 0 ? "to" : "from"} fund balance`,
  };
}

/**
 * The short over/under-budget suffix for a per-category driver row (Law Enforcement
 * Services, Property Taxes, and the like), so a bare "-$6.3M" never has to be read as a
 * signed number on its own. Revenue reads above/below budget; spending reads ran-over or
 * came-in-under, matching the register used in `describePerformanceEffect`.
 */
function describeCategoryEffect(kind: "revenue" | "spending", contribution: number): string {
  const amount = compactDollars(Math.abs(contribution));
  const addsToSavings = contribution >= 0;
  return kind === "spending"
    ? `${amount} ${addsToSavings ? "under" : "over"} budget`
    : `${amount} ${addsToSavings ? "above" : "below"} budget`;
}

function ActualResultPanel({ common, dataNotes,
  year,
  plannedBeginning,
  plannedChange,
  plannedEnding,
  actualBeginning,
  actualChange,
  actualEnding,
  plannedPositionAdjustment,
  plannedPositionAdjustmentMember,
  actualGaapAdjustment,
  plannedMoneyIn,
  plannedMoneyOut,
  actualMoneyIn,
  actualMoneyOut,
  finalBudgetNetChange,
  auditedNetChange,
  performanceBreakdown,
  comparison,
  numbering,
}: { dataNotes: DataNote[]; common: FundCommon;
  year: number;
  plannedBeginning: ResolvedMember;
  plannedChange: ResolvedMember;
  plannedEnding: ResolvedMember;
  actualBeginning: ResolvedMember;
  actualChange: ResolvedMember;
  actualEnding: ResolvedMember;
  plannedPositionAdjustment: number;
  plannedPositionAdjustmentMember: ResolvedMember | null;
  actualGaapAdjustment: number;
  /**
   * Null before FY2018, when the county published no source-to-budget statement. The
   * side-by-side money-in/money-out story needs both plans and both actuals; where the plan
   * is absent the panel falls back to the position ledger, which every audited year has.
   */
  plannedMoneyIn: number | null;
  plannedMoneyOut: number | null;
  actualMoneyIn: number | null;
  actualMoneyOut: number | null;
  finalBudgetNetChange: number | null;
  auditedNetChange: number | null;
  performanceBreakdown: Array<{ label: string; value: number; effectText: string }>;
  comparison: GeneralFundBudgetActualComparison | null;
  numbering: Map<string, number>;
}) {
  const basisNotes = dataNotes.filter(note => note.scope_type === "dataset")
    .filter((note) => note.render_contract === "basis_label");
  // Keyed by canonical_key so a marker follows the line across years and label changes,
  // rather than matching on display text that drifts.
  const lineNotes: Record<string, DataNote[]> = {};
  for (const note of dataNotes.filter(note => note.scope_type === "line")) {
    (lineNotes[note.scope_value] ??= []).push(note);
  }
  const plannedChangeValue = plannedChange.value ?? 0;
  const actualChangeValue = actualChange.value ?? 0;
  const budgetBookBridge = reconcileBudgetBookToActualEnding({
    plannedBeginning: plannedBeginning.value,
    plannedChange: plannedChange.value,
    plannedAdjustment: plannedPositionAdjustment,
    plannedEnding: plannedEnding.value,
    actualBeginning: actualBeginning.value,
    actualChange: actualChange.value,
    actualAdjustment: actualGaapAdjustment,
    actualEnding: actualEnding.value,
  });
  const finalBudgetDifference = finalBudgetNetChange !== null && auditedNetChange !== null
    ? auditedNetChange - finalBudgetNetChange
    : null;
  const flowContributionTotal = performanceBreakdown.reduce((sum, item) => sum + item.value, 0);
  const remainingBudgetBasisDifference = finalBudgetDifference === null
    ? null
    : finalBudgetDifference - flowContributionTotal;
  const residualComponents = comparison?.totals.residual_components ?? [];
  const residualComponentsExplain = remainingBudgetBasisDifference !== null
    && residualComponents.length > 0
    && residualComponents.reduce(
      (sum, component) => sum + (component.column === "actual" ? component.amount : -component.amount),
      0,
    ) === remainingBudgetBasisDifference;
  const contributionItems: ContributionRow[] = performanceBreakdown.map((item) => ({
    contribution: item.value,
    label: item.label,
    effectText: item.effectText,
  })).concat(remainingBudgetBasisDifference === null || remainingBudgetBasisDifference === 0
    ? []
    : [{
        contribution: remainingBudgetBasisDifference,
        ...(residualComponentsExplain
          ? describeNamedResidualEffect(residualComponents, remainingBudgetBasisDifference)
          : describeRemainderEffect(remainingBudgetBasisDifference)),
      }]);
  const comparisonMaximum = Math.max(
    ...contributionItems.map((item) => Math.abs(item.contribution)),
    1,
  );
  const contributionsReconcile = performanceBreakdown.length === 4
    && finalBudgetNetChange !== null && auditedNetChange !== null
    && contributionItems.reduce((sum, item) => sum + item.contribution, 0)
      === auditedNetChange - finalBudgetNetChange;

  const revenueVariance = comparison
    ? comparison.revenue_categories.reduce((total, row) => total + row.contribution, 0)
    : 0;
  const spendingVariance = comparison
    ? comparison.spending_categories.reduce((total, row) => total + row.contribution, 0)
    : 0;
  const categoryTotalsMatch = comparison
    && comparison.revenue_categories.reduce(
      (totals, row) => ({ budget: totals.budget + row.budget, actual: totals.actual + row.actual }),
      { budget: 0, actual: 0 },
    ).budget === comparison.totals.total_revenues.budget
    && comparison.revenue_categories.reduce(
      (total, row) => total + row.actual, 0,
    ) === comparison.totals.total_revenues.actual
    && comparison.spending_categories.reduce(
      (totals, row) => ({ budget: totals.budget + row.budget, actual: totals.actual + row.actual }),
      { budget: 0, actual: 0 },
    ).budget === comparison.totals.total_expenditures.budget
    && comparison.spending_categories.reduce(
      (total, row) => total + row.actual, 0,
    ) === comparison.totals.total_expenditures.actual;

  // The old copy asserted "all four audited revenue categories finished above the final
  // budget", which was true of FY2025 and of no other year in particular. Count instead.
  const revenueAbove = comparison
    ? comparison.revenue_categories.filter((row) => row.contribution > 0).length
    : 0;
  const revenueTotalCount = comparison ? comparison.revenue_categories.length : 0;
  const revenueSummary = revenueAbove === revenueTotalCount
    ? `All ${spellCount(revenueTotalCount)} audited revenue categories finished above the `
      + `final budget.`
    : `${spellCount(revenueAbove).replace(/^./, (c) => c.toUpperCase())} of `
      + `${spellCount(revenueTotalCount)} audited revenue categories finished above the final `
      + `budget; the rest came in below it.`;

  // Rendered whenever the year has both a planned and an audited ending balance to bridge
  // between. Previously gated on the fiscal year being 2025.
  const showForecastBridge = budgetBookBridge !== null;

  return (
    <section className="actual-result mt-5" aria-labelledby="actual-result-title">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="font-mono text-[10px] tracking-[0.15em] text-ink-faint uppercase">
            FY{year} budget and actual
          </p>
          <h3 id="actual-result-title" className="mt-1 font-display text-2xl font-semibold tracking-tight">
            The plan and the year-end result
          </h3>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-ink-secondary sm:text-right">
          The cards compare the budget-book plan with the audited result. The tables below use
          the final amended budget, after changes during the year.
        </p>
      </div>

      {canRenderResultStories({
        plannedBeginning: plannedBeginning.value,
        plannedChange: plannedChange.value,
        plannedEnding: plannedEnding.value,
        actualBeginning: actualBeginning.value,
        actualChange: actualChange.value,
        actualEnding: actualEnding.value,
        plannedMoneyIn,
        plannedMoneyOut,
        actualMoneyIn,
        actualMoneyOut,
      }) ? (
        <div className="result-stories mt-5">
          <ResultStory
            label={`FY${year} budget-book plan`}
            beginning={plannedBeginning.value ?? 0}
            moneyIn={plannedMoneyIn!}
            moneyOut={plannedMoneyOut!}
            change={plannedChangeValue}
            ending={plannedEnding.value ?? 0}
            beginningPrintedForm={plannedBeginning.printed_form}
            endingPrintedForm={plannedEnding.printed_form}
            source={<SourceLink common={common} member={plannedEnding} pageYear={year} />}
            tone="budget"
          />
          <ResultStory
            label={`FY${year} audited result`}
            beginning={actualBeginning.value ?? 0}
            moneyIn={actualMoneyIn!}
            moneyOut={actualMoneyOut!}
            change={actualChangeValue}
            ending={actualEnding.value ?? 0}
            beginningPrintedForm={actualBeginning.printed_form}
            endingPrintedForm={actualEnding.printed_form}
            source={<SourceLink common={common} member={actualEnding} pageYear={year} />}
            tone="actual"
          />
        </div>
      ) : (
        <div className="result-ledger mt-5">
          <div className="result-ledger-row result-ledger-head" aria-hidden="true">
            <span>Published view</span><span>Starts</span><span>Change</span><span>Ends</span>
          </div>
          <div className="result-ledger-row result-ledger-budget">
            <div><strong>FY{year} budget-book position forecast</strong><SourceLink common={common} member={plannedEnding} pageYear={year} /></div>
            <span data-label="Starts"><Amount value={plannedBeginning.value} printedForm={plannedBeginning.printed_form} /></span>
            <span data-label="Change"><Amount value={plannedChangeValue} printedForm={plannedChange.printed_form} /></span>
            <span data-label="Ends"><Amount value={plannedEnding.value} printedForm={plannedEnding.printed_form} /></span>
          </div>
          <div className="result-ledger-row result-ledger-actual">
            <div><strong>FY{year} audited position</strong><SourceLink common={common} member={actualEnding} pageYear={year} /></div>
            <span data-label="Starts"><Amount value={actualBeginning.value} printedForm={actualBeginning.printed_form} /></span>
            <span data-label="Change"><Amount value={actualChangeValue} printedForm={actualChange.printed_form} /></span>
            <span data-label="Ends"><Amount value={actualEnding.value} printedForm={actualEnding.printed_form} /></span>
          </div>
          {plannedPositionAdjustment !== 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
              The budget-book ending also includes the {plannedPositionAdjustmentMember
                ? displayName(common.entities[plannedPositionAdjustmentMember.entity_id])
                : "separately printed"} adjustment of{" "}
              <Amount value={plannedPositionAdjustment} printedForm={null} /> shown in the source;
              see the balance comparison below. {plannedPositionAdjustmentMember && (
                <SourceLink common={common} member={plannedPositionAdjustmentMember} pageYear={year} />
              )}
            </p>
          )}
          {actualGaapAdjustment !== 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
              The audited ending also includes the county&apos;s Budget-to-GAAP adjustment of{" "}
              <Amount value={actualGaapAdjustment} printedForm={null} />.
            </p>
          )}
        </div>
      )}

      {showForecastBridge && (
        <div className="forecast-bridge mt-5">
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
              Why the budget-book ending estimate differs from the audited ending balance
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              This compares the budget book&apos;s published estimate with the audit&apos;s reported
              ending balance. It keeps starting-balance, year-result, budget-book-only, and
              accounting-basis differences visible instead of treating them as money in or out.
            </p>
          </div>
          <div className="forecast-bridge-equation mt-4">
            <div><small>What the budget book expected to end with</small><strong><Amount value={plannedEnding.value} printedForm={plannedEnding.printed_form} /></strong></div>
            <b aria-label={budgetBookBridge.startRevision >= 0 ? "plus" : "minus"}>{budgetBookBridge.startRevision >= 0 ? "+" : "−"}</b>
            <div><small>{budgetBookBridge.startRevision >= 0 ? "The year actually started higher than the book assumed" : "The year actually started lower than the book assumed"}</small><strong><Amount value={Math.abs(budgetBookBridge.startRevision)} printedForm={null} /></strong></div>
            <b aria-label={budgetBookBridge.resultRevision >= 0 ? "plus" : "minus"}>{budgetBookBridge.resultRevision >= 0 ? "+" : "−"}</b>
            <div><small>{budgetBookBridge.resultRevision >= 0 ? "The year's result came in above the book's estimate" : "The year's result came in below the book's estimate"}</small><strong><Amount value={Math.abs(budgetBookBridge.resultRevision)} printedForm={null} /></strong></div>
            {budgetBookBridge.planAdjustment !== 0 && <>
              <b aria-label={budgetBookBridge.planAdjustment >= 0 ? "minus" : "plus"}>{budgetBookBridge.planAdjustment >= 0 ? "−" : "+"}</b>
              <div><small>Budget-book-only adjustment</small><strong><Amount value={Math.abs(budgetBookBridge.planAdjustment)} printedForm={null} /></strong></div>
            </>}
            {budgetBookBridge.auditAdjustment !== 0 && <>
              <b aria-label={budgetBookBridge.auditAdjustment >= 0 ? "plus" : "minus"}>{budgetBookBridge.auditAdjustment >= 0 ? "+" : "−"}</b>
              <div><small>Accounting-basis adjustment (Budget-to-GAAP)</small><strong><Amount value={Math.abs(budgetBookBridge.auditAdjustment)} printedForm={null} /></strong></div>
            </>}
            <b aria-label="equals">=</b>
            <div><small>Actual ending balance</small><strong><Amount value={actualEnding.value} printedForm={actualEnding.printed_form} /></strong></div>
          </div>
        </div>
      )}

      {/*
        The category drivers depend only on the audited comparison, which exists for every
        year FY2011-FY2025. The bridge above additionally needs the budget book's planned
        position, which the county only publishes in a form we hold from FY2018. Keeping
        them in one block hid eleven years of comparison data behind a statement that does
        not exist for those years.
      */}
      {comparison && (
        <div className="forecast-bridge mt-5">
          <p className="mb-3 text-xs leading-relaxed text-ink-secondary">
            The ACFR compares the audited result with the final amended budget. It does not
            replace the separate budget-book starting-balance forecast above.
          </p>
          {dataNotes.filter(note => note.note_id === "note.variance-interpretation").map(note => (
            <p key={note.note_id} className="mb-3 text-sm leading-relaxed text-ink-secondary">{note.text}</p>
          ))}
          <BudgetActualRows
            totalLabel="Change in fund balance"
            rows={[{
              label: "Net change in fund balance",
              budget: comparison.totals.net_change.budget,
              actual: comparison.totals.net_change.actual,
              budgetPrintedForm: comparison.totals.net_change.budget_printed_form,
              actualPrintedForm: comparison.totals.net_change.actual_printed_form,
              printed_page: comparison.totals.net_change.printed_page,
              pdf_page: comparison.totals.net_change.pdf_page,
            }]}
          />
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            A result better than the final budget can still mean a fall in fund balance;
            the actual net change shows whether the balance rose or fell.
          </p>
          <div className="mt-3 flex justify-end">
            <ComparisonSourceLink
              comparison={comparison}
              printedPage={comparison.totals.net_change.printed_page}
              pdfPage={comparison.totals.net_change.pdf_page}
            />
          </div>
          <a
            href="/downloads/comparisons/general-fund-totals-budget-actual.csv"
            download
            className="mt-3 inline-block text-xs font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            Download final-budget totals and actuals (CSV)
          </a>
          {performanceBreakdown.length > 0 && (
            <div className="border-t border-ink/10 pt-3 first:border-0 first:pt-0">
              <p className="text-xs leading-relaxed text-ink-secondary">
                {contributionsReconcile
                  ? `${spellCount(performanceBreakdown.length).replace(/^./, (c) => c.toUpperCase())} money-in and money-out changes${remainingBudgetBasisDifference ? (residualComponentsExplain ? " plus one other financing line" : " plus a calculated remainder") : ""} account for the ${compactDollars(Math.abs((auditedNetChange ?? 0) - (finalBudgetNetChange ?? 0)))} difference between the final amended budget and the audited result.`
                  : "These published changes show parts of the difference between the final amended budget and the audited result. They do not provide a complete reconciliation of the change in fund balance."}{" "}
                Every bar uses the same{" "}
                {compactDollars(comparisonMaximum)} scale.
              </p>
              {remainingBudgetBasisDifference !== null && remainingBudgetBasisDifference !== 0 && (
                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  {residualComponentsExplain
                    ? `The remaining ${formatAmount(Math.abs(remainingBudgetBasisDifference))} is a line the audited report prints beside its transfers: ${residualComponents
                        .map((component) => `${component.label}${component.column === "final_budget" ? " in the final budget" : ""}, ${formatAmount(Math.abs(component.amount))} (printed p.${component.source_page})`)
                        .join("; ")}.`
                    : `The calculated remainder is ${compactDollars(Math.abs(remainingBudgetBasisDifference))}. It balances the published comparison but does not identify a separate revenue line or explain the individual items within it.`}{" "}
                  <ComparisonSourceLink
                    comparison={comparison}
                    printedPage={comparison.totals.net_change.printed_page}
                    pdfPage={comparison.totals.net_change.pdf_page}
                  />
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                Each bar shows how that item moved the fund&apos;s ending balance compared with the
                final amended budget.
              </p>
              <div className="mt-3 rounded-lg bg-white/75 p-3">
                <ContributionRows
                  items={contributionItems}
                  maximum={comparisonMaximum}
                  comparison={comparison}
                    numbering={numbering}
                />
              </div>

              {categoryTotalsMatch ? <div className="variance-details mt-4">
                <details open>
                  <summary>
                    What drove revenue {compactDollars(Math.abs(revenueVariance))}{" "}
                    {revenueVariance >= 0 ? "above" : "below"} budget?
                  </summary>
                  <p>
                    {revenueSummary}
                    <NoteMark notes={basisNotes} numbering={numbering} />
                  </p>
                  <ContributionRows
                    items={[...comparison.revenue_categories]
                      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                      .map((row) => ({
                        label: row.label,
                        canonical_key: row.canonical_key,
                        contribution: row.contribution,
                        budget: row.budget,
                        actual: row.actual,
                        printed_page: row.printed_page,
                        pdf_page: row.pdf_page,
                        effectText: describeCategoryEffect("revenue", row.contribution),
                      }))}
                    lineNotes={lineNotes}
                    maximum={comparisonMaximum}
                    comparison={comparison}
                    numbering={numbering}
                    showValues
                  />
                </details>
                <details>
                  <summary>
                    What drove spending {compactDollars(Math.abs(spendingVariance))}{" "}
                    {spendingVariance >= 0 ? "below" : "above"} budget?
                  </summary>
                  <p>
                    Each bar shows how that department&apos;s spending compared with its final
                    budget. Running over budget draws down the fund&apos;s balance; coming in
                    under budget adds to it.
                  </p>
                  <ContributionRows
                    items={[...comparison.spending_categories]
                      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                      .map((row) => ({
                        label: row.label,
                        canonical_key: row.canonical_key,
                        contribution: row.contribution,
                        budget: row.budget,
                        actual: row.actual,
                        printed_page: row.printed_page,
                        pdf_page: row.pdf_page,
                        effectText: describeCategoryEffect("spending", row.contribution),
                      }))}
                    lineNotes={lineNotes}
                    maximum={comparisonMaximum}
                    comparison={comparison}
                    numbering={numbering}
                    showValues
                  />
                </details>
              </div> : (
                <p className="mt-4 text-xs leading-relaxed text-ink-secondary">
                  Department-category detail is not shown because it does not reconcile to the
                  audited final totals for this year.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const TRANSFER_IN_EXPLANATIONS: Record<string, string> = {
  "fin.gf.transfer-in.infrastructure-bank":
    "From the Infrastructure Bank. Its outside funding is primarily fee-in-lieu-of-tax and property-tax-like receipts.",
  "fin.gf.transfer-in.workers-compensation":
    "From accumulated Workers Compensation fund balance. This is existing county money, not new outside revenue.",
  "fin.gf.transfer-in.hospitality-tax":
    "From hospitality-tax receipts, for eligible public-safety-related costs under the ordinance.",
  "fin.gf.transfer-in.state-accommodations":
    "From the State Accommodations Tax fund: the County’s portion of accommodations-tax revenue.",
};

function TransferSourceDetail({ common,
  member,
  total,
  year,
}: { common: FundCommon;
  member: ResolvedMember;
  total: number;
  year: number;
}) {
  const entity = common.entities[member.entity_id];
  const value = member.value ?? 0;
  return (
    <li className="border-t border-ink/10 py-3 first:border-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <EntityYearLink common={common}
          entityId={member.entity_id}
          fiscalYear={year}
          className="font-medium underline decoration-hairline underline-offset-4 hover:text-accent"
        >
          {entity ? displayName(entity) : member.entity_id}
        </EntityYearLink>
        <strong className="shrink-0 font-mono text-xs font-medium tabular-nums">
          <Amount value={value} printedForm={member.printed_form} />
        </strong>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
        <span className="block h-full rounded-full bg-[#00795a]" style={{ width: `${percent(value, total)}` }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
        {TRANSFER_IN_EXPLANATIONS[member.entity_id]}
      </p>
    </li>
  );
}

export function GeneralFundCycleContent({ input, common, correction, services, history }: {
  input: GeneralFundInput; common: FundCommon; correction: ReactNode; services: ReactNode; history: ReactNode;
}) {
  const { year } = input;
  const yearGroups = input.yearGroups;

  // Everything that qualifies this year's figures, minus the line-level markers, which are
  // rendered against the lines themselves rather than collected at the foot of the page.
  // Every caveat whose declared scope reaches this page, line-level ones included: they are
  // marked against their figures but their text belongs with all the others at the foot.
  const pageNotes = input.pageNotes;
  const noteNumbering = numberNotes(pageNotes);
  const budgetSources = input.statements["gf.budget-sources"];
  const position = input.statements["gf.position"];
  const outflow = input.statements["gf.outflow"];
  const operatingOverview = input.statements["gf.operating-overview"];
  const otherRevenueDetail = input.statements["gf.other-revenue-detail"];
  const transferInDetail = input.statements["gf.transfer-in-detail"];
  const transferOutDetail = input.statements["gf.transfer-out-detail"];
  const hasTransferDetails = Boolean(transferInDetail && transferOutDetail);
  const actualPosition = input.statements["gf.actual-position"];
  const budgetActualComparison = input.comparison;

  const revenue = memberById(budgetSources, "rev.total-estimated-financial-sources");
  const transfersIn = memberById(budgetSources, "fin.gf.transfers-in");
  const plannedBalanceUse = memberById(budgetSources, "balance.gf.net-change");
  const budget = memberById(budgetSources, "fund.general") ?? memberById(outflow, "fund.general");

  const beginning = memberById(position, "balance.gf.beginning");
  const netChange = memberById(position, "balance.gf.net-change");
  const ending = memberById(position, "balance.gf.ending");
  const actualBeginning = memberById(actualPosition, "balance.gf.beginning");
  const actualNetChange = memberById(actualPosition, "balance.gf.net-change");
  const actualEnding = memberById(actualPosition, "balance.gf.ending");
  const plannedPositionAdjustments = position?.members.filter(
    (member) => member.member_role === "position_adjustment",
  ) ?? [];
  const actualPositionAdjustments = actualPosition?.members.filter(
    (member) => member.member_role === "position_adjustment",
  ) ?? [];
  // `value` is the amount as printed; `signed_value` is the statement operand after its
  // membership sign. Sum the latter so a future source-printed subtractive position item
  // cannot silently reverse the ending-balance bridge.
  const plannedPositionAdjustment = plannedPositionAdjustments.reduce(
    (total, member) => total + (member.signed_value ?? 0), 0,
  );
  const actualGaapAdjustment = actualPositionAdjustments.reduce(
    (total, member) => total + (member.signed_value ?? 0), 0,
  );
  const positionAdjustment = position?.members.find(
    (member) => member.member_role === "position_adjustment" && member.value !== 0,
  ) ?? null;

  const operating = memberById(outflow, "use.gf.operating-total");
  const transfersOut = memberById(outflow, "fin.gf.transfers-out");
  const annualMoneyIn = revenue?.value !== null && revenue?.value !== undefined
    && transfersIn?.value !== null && transfersIn?.value !== undefined
    ? revenue.value + transfersIn.value
    : null;
  const annualMoneyOut = operating?.value !== null && operating?.value !== undefined
    && transfersOut?.value !== null && transfersOut?.value !== undefined
    ? operating.value + transfersOut.value
    : null;
  const annualDifference = annualMoneyIn !== null && annualMoneyOut !== null
    ? annualMoneyIn - annualMoneyOut
    : null;
  const flowComparisonMax = Math.max(annualMoneyIn ?? 0, annualMoneyOut ?? 0, 1);

  const revenueComponents = REVENUE_COMPONENT_IDS.map((entityId) => {
    const point = input.revenuePoints[entityId];
    return point?.value === null || point?.value === undefined
      ? null
      : { entityId, label: displayName(common.entities[entityId]), value: point.value, printedForm: point.printed_form };
  }).filter((item): item is VisualDatum => item !== null);
  // The county's own published revenue estimate for this year, taken from the entity series
  // rather than the sources-to-budget statement. Before FY2018 that statement does not
  // exist, and reading only the statement made the page print "not published" over a figure
  // the county published and this same build renders elsewhere.
  const publishedRevenuePoint = input.revenuePoints["rev.total-estimated-financial-sources"]
    ?? null;
  const publishedRevenueEstimate = publishedRevenuePoint?.value ?? null;

  const otherRevenueLines = otherRevenueDetail?.members.filter(
    (member) => member.member_role === "revenue_detail" && (member.value ?? 0) > 0,
  ) ?? [];
  const transferInLines = transferInDetail?.members.filter(
    (member) => member.member_role === "transfer_detail" && (member.value ?? 0) > 0,
  ) ?? [];
  const transferOutLines = transferOutDetail?.members.filter(
    (member) => member.member_role === "transfer_detail" && (member.value ?? 0) > 0,
  ) ?? [];
  const auditedRows = budgetActualComparison
    ? auditedBudgetActualRows(budgetActualComparison)
    : null;
  const actualMoneyIn = auditedRows?.moneyIn.at(-1)?.actual ?? null;
  const actualMoneyOut = auditedRows?.moneyOut.at(-1)?.actual ?? null;
  const actualPerformanceBreakdown = budgetActualComparison
    ? [
        (() => {
          const totals = budgetActualComparison.totals;
          const contribution = totals.total_revenues.actual - totals.total_revenues.budget;
          return { value: contribution, ...describePerformanceEffect("revenue", contribution) };
        })(),
        (() => {
          const totals = budgetActualComparison.totals;
          const contribution = totals.total_expenditures.budget - totals.total_expenditures.actual;
          return { value: contribution, ...describePerformanceEffect("spending", contribution) };
        })(),
        (() => {
          const totals = budgetActualComparison.totals;
          const contribution = totals.transfers_in.actual - totals.transfers_in.budget;
          return { value: contribution, ...describePerformanceEffect("transfers-in", contribution) };
        })(),
        (() => {
          const totals = budgetActualComparison.totals;
          const contribution = totals.transfers_out.actual - totals.transfers_out.budget;
          return { value: contribution, ...describePerformanceEffect("transfers-out", contribution) };
        })(),
      ]
    : [];

  /**
   * How the year's money out divides between operations and transfers, as text on each
   * line rather than as a bar underneath both.
   *
   * Through `allocateShares` rather than two independent divisions: it is the one place
   * share-of-whole math happens in this app, and it guarantees the two figures sum to
   * exactly 100.0 instead of to 99.9 or 100.1 depending on where the rounding falls. A
   * total that does not add up is precisely the kind of arithmetic this site cannot afford
   * to show.
   *
   * Empty when either component is unpublished — a share computed from a missing operand
   * would be a fabricated proportion.
   */
  /**
   * The section-jump targets that exist on THIS year's page.
   *
   * Guarded by the same conditions that render each section, so the control can never
   * offer an anchor that resolves to nothing. Kept adjacent to those conditions
   * deliberately: the failure mode is a section gaining a new render condition and this
   * list not following it, which no type check would catch.
   */
  const jumpSections = [
    beginning && ending && annualMoneyIn !== null && annualMoneyOut !== null
      && annualDifference !== null
      ? { id: "summary", label: "Summary" }
      : null,
    { id: "money-in", label: "Money in" },
    hasTransferDetails ? { id: "transfers", label: "Transfers" } : null,
    { id: "money-out", label: "Money out" },
    { id: "change-over-time", label: "Compare years" },
    { id: "services", label: "Services" },
    { id: "coverage", label: "Coverage" },
  ].filter((section): section is { id: string; label: string } => section !== null);

  const outflowShares: { operating?: string; transfersOut?: string } = (() => {
    const operatingValue = operating?.value ?? null;
    const transfersOutValue = transfersOut?.value ?? null;
    if (operatingValue === null || transfersOutValue === null) return {};
    if (operatingValue + transfersOutValue === 0) return {};

    const [operatingShare, transfersShare] = allocateShares([
      { id: "operating", value: operatingValue },
      { id: "transfers-out", value: Math.abs(transfersOutValue) },
    ]);
    return {
      operating: `${formatShare(operatingShare.share)} of money out`,
      transfersOut: `${formatShare(transfersShare.share)} of money out`,
    };
  })();

  const overviewDefinition = { canonical_name: input.overviewName };
  const overviewCategories = operatingOverview?.members
    .filter((member) => member.member_role === "operating_overview_category")
    .sort((a, b) => a.display_order - b.display_order) ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-secondary">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          County budget
        </Link>
        <span aria-hidden="true"> / </span>
        <span>General Fund</span>
      </nav>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-accent uppercase">
            Greenville County · FY{year}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-6xl">
            How the General Fund moves through one year
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-secondary">
            Revenue and transfers make resources available. The fund begins and ends the year with
            an accounting position. The adopted budget then directs money to operations and transfers.
          </p>
        </div>
        <div className="lg:text-right">
          <div className="flex items-center gap-2 lg:justify-end">
            <span className="font-mono text-xs text-ink-secondary uppercase">General Fund budget</span>
            <StatusBadge label="Adopted" />
          </div>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink tabular-nums">
            <Amount value={budget?.value ?? null} printedForm={budget?.printed_form ?? null} />
          </p>
          <SourceLink common={common} member={budget} pageYear={year} />
        </div>
      </div>

      {/*
        Group all covered years by the available evidence. These query URLs remain
        copyable; the explorer requires JavaScript to select their historical detail.
        Each group scrolls horizontally on a narrow screen, and aria-current marks
        the selected year.
      */}
      <nav
        aria-label="Fiscal year"
        className="mt-9 space-y-3 border-y border-hairline py-4"
      >
        <div className="sm:hidden">
          <MobileFiscalYearSelect groups={yearGroups} currentYear={year} />
        </div>
        <div className="hidden space-y-3 sm:block">
          <p className="font-mono text-[11px] tracking-wide text-ink-faint uppercase">
            Choose fiscal year
          </p>
          {yearGroups.map((group) => (
            <div key={group.key}>
              <p className="text-xs text-ink-secondary">
                <span className="font-medium text-ink">{group.label}</span>{" "}
                <span className="text-ink-faint">{group.description}</span>
              </p>
              <div className="-mx-1 mt-1.5 flex gap-1 overflow-x-auto px-1 pb-1">
                {group.years.map((fiscalYear: number) => (
                  <Link
                    key={fiscalYear}
                    href={`/e/fund.general/?fy=${fiscalYear}`}
                    aria-current={fiscalYear === year ? "page" : undefined}
                    // min-h-11 is 44px: the year chips were 28px tall, below every
                    // touch-target guideline, on a control a phone reader uses most.
                    className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 font-mono text-xs ${
                      fiscalYear === year
                        ? "bg-ink text-white"
                        : "text-ink-secondary hover:bg-hairline hover:text-ink"
                    }`}
                  >
                    FY{fiscalYear}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/*
        In-page orientation for a page that runs several thousand pixels.

        Built from the sections this YEAR actually renders, never from a fixed list: the
        summary equation needs a published position, and the transfers explainer only
        needs both source-printed detail statements. A jump link to a section that is not on the page is worse than
        no jump link, because it silently does nothing when clicked.

        Not sticky. The plan allowed it after testing; on a 390px viewport a sticky row
        costs ~44px of every screen for the whole page, and the control's value is
        concentrated in the first screenful. `scroll-mt-4` on each target keeps a heading
        clear of the top edge when jumped to, and there is no smooth-scroll override, so
        the reduced-motion policy needs no exception here.
      */}
      {jumpSections.length > 1 && (
        <nav
          aria-label="On this page"
          className="-mx-1 mt-3 flex flex-wrap gap-1 px-1 pb-1"
        >
          {jumpSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-hairline px-3.5 text-xs text-ink-secondary hover:border-ink/30 hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>
      )}

      {!budgetSources && (
        <p className="mt-8 rounded-md border border-hairline bg-surface p-4 text-sm text-ink-secondary">
          The county began publishing a complete source-to-budget statement in FY2018, so the
          full money-in, position and money-out loop is not available for FY{year}. The audited
          result below comes from the county&apos;s annual financial report and is complete.
        </p>
      )}

      {correction}
      <p className="mt-5 text-sm text-ink-secondary">
        Does a figure or citation look wrong?{" "}
        <ReportErrorLink
          pagePath={`/e/fund.general/?fy=${year}`}
          fiscalYear={year}
          entityId="fund.general"
          className="font-medium text-accent underline decoration-dotted underline-offset-2"
        />
      </p>

      {/*
        Money in for years with no printed sources-to-budget statement. The categories and
        the estimate are the county's own published figures; what is missing is the statement
        tying them together, which is what the footnote says. No total is synthesised here:
        the estimate shown is a published value, and the categories are shown beside it
        rather than summed into something the county never printed.
      */}
      {!budgetSources && publishedRevenueEstimate !== null && revenueComponents.length > 0 && (
        <section className="mt-8" aria-labelledby="pre2018-money-in-title">
          <h2
            id="pre2018-money-in-title"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            Money in
            <NoteMark
              notes={input.dataNotes.filter(note => note.scope_type === "fiscal_year")
                .filter((note) => note.note_type === "statement_not_printed")}
              numbering={noteNumbering}
            />
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
            The county estimated <Amount value={publishedRevenueEstimate} printedForm={publishedRevenuePoint?.printed_form ?? null} /> of General Fund
            revenue for FY{year}, in these categories.
          </p>
          <div className="mt-4">
            <CompositionBar
              items={revenueComponents}
              total={publishedRevenueEstimate}
              colors={IN_COLORS}
              label={`FY${year} estimated revenue composition`}
            />
            <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {revenueComponents.map((item, index) => (
                <li key={item.entityId} className="flex items-baseline justify-between gap-3 text-sm">
                  <EntityYearLink common={common}
                    entityId={item.entityId}
                    fiscalYear={year}
                    className="underline decoration-hairline underline-offset-4 hover:text-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: IN_COLORS[index % IN_COLORS.length] }}
                    />
                    {item.label}
                  </EntityYearLink>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    <Amount value={item.value} printedForm={item.printedForm} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/*
        Years before FY2018 have an audited result and a budget-versus-actual comparison but
        no budget-book money-in statement, so they never reached the balance-flow section
        that renders the panel. They showed a notice about what was missing and nothing about
        what was present.
      */}
      {!budgetSources && actualBeginning && actualNetChange && actualEnding
        && beginning && netChange && ending && (
        <section className="mt-8" aria-labelledby="actual-result-title">
          <p className="mb-4 text-sm leading-relaxed text-ink-secondary">{FUND_BALANCE_CONTEXT}</p>
          <ActualResultPanel common={common} dataNotes={input.dataNotes}
            year={year}
            plannedBeginning={beginning}
            plannedChange={netChange}
            plannedEnding={ending}
            actualBeginning={actualBeginning}
            actualChange={actualNetChange}
            actualEnding={actualEnding}
            plannedPositionAdjustment={plannedPositionAdjustment}
            plannedPositionAdjustmentMember={positionAdjustment}
            actualGaapAdjustment={actualGaapAdjustment}
            plannedMoneyIn={annualMoneyIn}
            plannedMoneyOut={annualMoneyOut}
            actualMoneyIn={actualMoneyIn}
            actualMoneyOut={actualMoneyOut}
            finalBudgetNetChange={auditedRows?.finalBudgetNetChange ?? null}
            auditedNetChange={auditedRows?.actualNetChange ?? null}
            performanceBreakdown={actualPerformanceBreakdown}
            comparison={budgetActualComparison}
            numbering={noteNumbering}
          />
        </section>
      )}

      {beginning && ending && annualMoneyIn !== null && annualMoneyOut !== null && annualDifference !== null && (
        <section
          id="summary"
          className="balance-flow mt-10 scroll-mt-4"
          aria-labelledby="annual-balance-flow-title"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.16em] text-ink-secondary uppercase">
                The year in one line
              </p>
              <h2 id="annual-balance-flow-title" className="mt-2 font-display text-3xl font-semibold tracking-tight">
                {annualDifference < 0
                  ? `The FY${year} budget ${year < 2026 ? "planned" : "plans"} to use ${compactDollars(Math.abs(annualDifference))} of fund balance`
                  : `The FY${year} budget ${year < 2026 ? "planned" : "plans"} to add ${compactDollars(annualDifference)} to fund balance`}
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-secondary lg:text-right">
              This is the plan printed in the selected budget book, not the actual year-end result.
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">{FUND_BALANCE_CONTEXT}</p>

          <div className="balance-flow-equation mt-7">
            <BalanceFlowStep common={common}
              eyebrow="1 · Starts with"
              label="Starting balance, as the budget book estimated it"
              detail="The fund's estimated starting position used by this budget."
              value={beginning.value}
              member={beginning}
              tone="beginning"
            />
            <BalanceFlowOperator symbol="+" label="plus" />
            <BalanceFlowStep common={common}
              eyebrow="2 · Money in"
              label="Budgeted revenue + transfers in"
              detail="Resources expected to enter the General Fund during the year."
              value={annualMoneyIn}
              member={null}
              tone="in"
            />
            <BalanceFlowOperator symbol="−" label="minus" />
            <BalanceFlowStep common={common}
              eyebrow="3 · Money out"
              label="Budgeted operations + transfers out"
              detail="Resources the adopted budget authorizes to leave the fund."
              value={annualMoneyOut}
              member={null}
              tone="out"
            />
            {positionAdjustment && (
              <>
                <BalanceFlowOperator symbol="+" label="plus" />
                <BalanceFlowStep common={common}
                  eyebrow="Bookkeeping adjustment to the starting balance, from the audit"
                  label={displayName(common.entities[positionAdjustment.entity_id]) || "Position adjustment"}
                  // The entity's own description when it has one, rather than a generic
                  // sentence for every adjustment. FY2022's is federal recovery money and
                  // says so; a future adjustment will have its own reason, and that reason
                  // belongs in the data next to the figure, not in this component.
                  detail={
                    common.entities[positionAdjustment.entity_id]?.plain_language_description
                    ?? "A separately printed adjustment needed to reconcile this year's fund position."
                  }
                  value={positionAdjustment.value}
                  member={positionAdjustment}
                  tone="adjustment"
                />
              </>
            )}
            <BalanceFlowOperator symbol="=" label="equals" />
            <BalanceFlowStep common={common}
              eyebrow="4 · Ends with"
              label="Projected ending fund balance"
              detail="The fund's projected position after the budgeted inflows and outflows."
              value={ending.value}
              member={ending}
              tone="ending"
            />
          </div>

          <div className="flow-comparison mt-6">
            <div className="flow-comparison-row">
              <span>Money in</span>
              <div className="flow-comparison-track">
                <span
                  className="flow-comparison-bar flow-comparison-bar-in"
                  style={{ width: `${(annualMoneyIn / flowComparisonMax) * 100}%` }}
                />
              </div>
              <strong><Amount value={annualMoneyIn} printedForm={null} /></strong>
            </div>
            <div className="flow-comparison-row">
              <span>Money out</span>
              <div className="flow-comparison-track">
                <span
                  className="flow-comparison-bar flow-comparison-bar-out"
                  style={{ width: `${(annualMoneyOut / flowComparisonMax) * 100}%` }}
                />
              </div>
              <strong><Amount value={annualMoneyOut} printedForm={null} /></strong>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/15 pt-3">
              <strong className="font-mono text-sm tabular-nums">
                {annualDifference < 0 ? "Planned use of fund balance" : "Planned addition to fund balance"}: <Amount value={Math.abs(annualDifference)} printedForm={null} />
              </strong>
              <span className="text-xs leading-relaxed text-ink-secondary">
                {annualDifference < 0
                  ? "Money out exceeds money in, so the plan draws down the fund balance by this amount."
                  : "Money in exceeds money out, so the plan adds this amount to the fund balance."}
              </span>
              <SourceLink common={common} member={netChange ?? plannedBalanceUse} pageYear={year} />
            </div>
          </div>

          {beginning && netChange && ending && actualBeginning && actualNetChange && actualEnding && (
            <ActualResultPanel common={common} dataNotes={input.dataNotes}
              year={year}
              plannedBeginning={beginning}
              plannedChange={netChange}
              plannedEnding={ending}
              actualBeginning={actualBeginning}
              actualChange={actualNetChange}
              actualEnding={actualEnding}
              plannedPositionAdjustment={plannedPositionAdjustment}
              plannedPositionAdjustmentMember={positionAdjustment}
              actualGaapAdjustment={actualGaapAdjustment}
              plannedMoneyIn={annualMoneyIn}
              plannedMoneyOut={annualMoneyOut}
              actualMoneyIn={actualMoneyIn}
              actualMoneyOut={actualMoneyOut}
              finalBudgetNetChange={auditedRows?.finalBudgetNetChange ?? null}
              auditedNetChange={auditedRows?.actualNetChange ?? null}
              performanceBreakdown={actualPerformanceBreakdown}
              comparison={budgetActualComparison}
              numbering={noteNumbering}
            />
          )}
        </section>
      )}

      <div className="cycle-grid mt-10">
        <CycleSection
          id="money-in"
          eyebrow="Inside money in"
          title="What enters the General Fund"
          description="Current-year revenue and transfers are inflows. The beginning fund balance is shown separately above because it was already in the fund."
          tone="in"
        >
          {budgetActualComparison && auditedRows ? (
            <>
              <p className="mb-3 text-xs leading-relaxed text-ink-secondary">
                Final amended budget compared with the audited result. This ACFR comparison is
                separate from the adopted budget-book plan shown in the year summary.
              </p>
              <BudgetActualRows
                totalLabel="Money In"
                rows={auditedRows.moneyIn}
              />
              <div className="mt-4 flex justify-end">
                <ComparisonSourceLink
                  comparison={budgetActualComparison}
                  printedPage={auditedRows.moneyIn.at(-1)?.printed_page}
                  pdfPage={auditedRows.moneyIn.at(-1)?.pdf_page}
                />
              </div>
            </>
          ) : <ul>
            <StatementLine common={common}
              member={revenue}
              label="Estimated revenue"
              detail="Property taxes, county-office revenue, intergovernmental revenue, and Other Revenue."
              fiscalYear={year}
            />
            {revenue && revenueComponents.length > 0 && (
              <li className="pb-3">
                <CompositionBar
                  items={revenueComponents}
                  total={revenue.value ?? 0}
                  colors={IN_COLORS}
                  label="Estimated revenue composition"
                />
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {revenueComponents.map((item, index) => (
                    <EntityYearLink common={common}
                      key={item.entityId}
                      entityId={item.entityId}
                      fiscalYear={year}
                      className="flex items-center gap-1.5 text-[11px] text-ink-secondary hover:text-accent"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: IN_COLORS[index] }}
                      />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto font-mono">{percent(item.value, revenue.value ?? 0)}</span>
                    </EntityYearLink>
                  ))}
                </div>
              </li>
            )}
            <StatementLine common={common}
              member={transfersIn}
              label="Transfers in"
              detail={hasTransferDetails
                ? "Money entering from four county funds. The detailed transfer summary identifies each amount below."
                : "Money entering the General Fund from other county funds."}
              fiscalYear={year}
            />
            <StatementLine common={common}
              member={null}
              label="Total money in"
              value={annualMoneyIn}
              detail="Estimated revenue + transfers into the General Fund."
              emphasis
              fiscalYear={year}
            />
          </ul>}
        </CycleSection>

        <CycleSection
          id="money-out"
          eyebrow="Inside money out"
          title="What leaves the General Fund"
          description="Operating uses and transfers out are shown separately so a transfer is not mistaken for department spending."
          tone="out"
        >
          {budgetActualComparison && auditedRows ? (
            <>
              <p className="mb-3 text-xs leading-relaxed text-ink-secondary">
                Final amended budget compared with the audited result. Money Out is operations
                plus transfers to other county funds.
              </p>
              <BudgetActualRows
                totalLabel="Money Out"
                rows={auditedRows.moneyOut}
              />
              <div className="mt-4 flex justify-end">
                <ComparisonSourceLink
                  comparison={budgetActualComparison}
                  printedPage={auditedRows.moneyOut.at(-1)?.printed_page}
                  pdfPage={auditedRows.moneyOut.at(-1)?.pdf_page}
                />
              </div>
            </>
          ) : <ul>
            {/* The composition bar that used to sit between these lines is gone. It was
                rendered AFTER "Transfers out", so its large operations segment appeared to
                describe the small transfers figure directly above it — the text said one
                thing and the picture said the opposite. Each share now sits against the
                amount it describes, computed from the selected year rather than written in
                as FY2026 strings. */}
            <StatementLine common={common}
              member={operating}
              label="Operating budget"
              detail="County services such as law enforcement, public safety, courts, public works, and administration."
              fiscalYear={year}
              share={outflowShares.operating}
            />
            <StatementLine common={common}
              member={transfersOut}
              label="Transfers out"
              detail="Money moved to another county fund for debt service and other defined purposes—not a second expense."
              fiscalYear={year}
              share={outflowShares.transfersOut}
            />
            <StatementLine common={common}
              member={budget}
              label="Total General Fund budget"
              detail="Operating budget + transfers out."
              emphasis
              fiscalYear={year}
            />
          </ul>}
          {services}
        </CycleSection>
      </div>

      <details className="mt-8 border-y border-hairline py-4">
        <summary className="cursor-pointer font-medium text-accent">How has the General Fund budget changed over time?</summary>
        {history}
      </details>

      {hasTransferDetails && (
        <section id="transfers" className="mt-14 scroll-mt-4 border-t border-hairline pt-9">
          <div className="max-w-3xl">
            <p className="font-mono text-xs tracking-[0.16em] text-ink-secondary uppercase">
              How transfers work
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Transfers move money between county funds
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              {`The county moves money between funds to support defined purposes. The FY${year} budget names the funds sending money into the General Fund and shows where transfers out are directed.`}
            </p>
          </div>

          <div className="transfer-map mt-7">
            <article className="transfer-map-side transfer-map-in">
              <p className="font-mono text-[11px] tracking-wide text-ink-faint uppercase">What moves in</p>
              <ul className="mt-3">
                {transferInLines.map((member) => (
                  <TransferSourceDetail common={common}
                    key={member.entity_id}
                    member={member}
                    total={transfersIn?.value ?? 0}
                    year={year}
                  />
                ))}
              </ul>
              {year === 2026 && <p className="mt-4 text-xs leading-relaxed text-ink-secondary">
                The transfer table reconciles to the total. Its Hospitality Tax narrative is one dollar lower than its summary table.
              </p>}
            </article>

            <div className="transfer-map-arrow transfer-map-arrow-in" aria-label={`${transfersIn?.value ?? 0} enters the General Fund`}>
              <strong>{compactDollars(transfersIn?.value ?? null)}</strong>
              <span aria-hidden="true">→</span>
              <small>enters</small>
            </div>

            <div className="transfer-map-fund">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase">The container</span>
              <strong>General Fund</strong>
            </div>

            <div className="transfer-map-arrow transfer-map-arrow-out" aria-label={`${transfersOut?.value ?? 0} leaves the General Fund`}>
              <strong>{compactDollars(transfersOut?.value ?? null)}</strong>
              <span aria-hidden="true">→</span>
              <small>leaves</small>
            </div>

            <article className="transfer-map-side transfer-map-out">
              <p className="font-mono text-[11px] tracking-wide text-ink-faint uppercase">Printed uses</p>
              <ul className="mt-2">
                {transferOutLines.map((member) => (
                  <RankedDetail common={common}
                    key={member.entity_id}
                    member={member}
                    total={transfersOut?.value ?? 0}
                    color="#b23a24"
                    year={year}
                  />
                ))}
              </ul>
            </article>
          </div>
        </section>
      )}

      {otherRevenueDetail && (
        <section className="mt-14 grid gap-8 border-t border-hairline pt-9 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-ink-secondary uppercase">
              Inside Money In
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Smaller General Fund revenue sources
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              The county groups these under the official label “Other Revenue”: <strong className="font-medium text-ink"><Amount value={memberById(otherRevenueDetail, "rev.other")?.value ?? null} printedForm={memberById(otherRevenueDetail, "rev.other")?.printed_form ?? null} /></strong>{` in FY${year}. They include franchise fees, investment earnings, cost reimbursements, retiree insurance premiums, rents, and miscellaneous receipts. Zero-value lines remain in the downloadable statement but are omitted here.`}
            </p>
            <div className="mt-4"><SourceLink common={common} member={otherRevenueLines[0] ?? null} pageYear={year} /></div>
          </div>
          <ol className="grid gap-x-8 sm:grid-cols-2">
            {otherRevenueLines.map((member) => (
              <RankedDetail common={common}
                key={member.entity_id}
                member={member}
                total={memberById(otherRevenueDetail, "rev.other")?.value ?? 0}
                color="#00795a"
                year={year}
              />
            ))}
          </ol>
        </section>
      )}

      <section id="services" className="mt-14 border-t border-hairline pt-9">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)] sm:items-end">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-ink-secondary uppercase">
              Inside the operating budget
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              The county&apos;s broad money-out view
            </h2>
            <Link
              href="/compare/"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              Compare years →
            </Link>
          </div>
          <p className="text-sm leading-relaxed text-ink-secondary">
            These categories sum to the operating budget. They are a source-printed overview,
            parallel to the more detailed department organization—not another layer to add on top.
          </p>
        </div>

        <ol className="mt-7 grid gap-x-8 sm:grid-cols-2">
          {overviewCategories.map((member) => {
            return (
              <RankedDetail common={common}
                key={member.entity_id}
                member={member}
                total={operating?.value ?? 0}
                color="#b23a24"
                year={year}
              />
            );
          })}
        </ol>
        <p className="mt-5 font-mono text-xs text-ink-faint">
          {overviewDefinition.canonical_name} · signed reconciliation difference: {operatingOverview?.signed_delta ?? "not available"}
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-hairline bg-surface p-5 text-sm leading-relaxed text-ink-secondary">
        <h2 className="font-medium text-ink">How to read this page</h2>
        <p className="mt-2">
          The three sections reconcile, but they do not claim that a particular tax dollar paid a
          particular department. Greenville County accounts for resources at the fund level. Every
          linked line opens its history, status, and original source.
        </p>
      </section>

      <NoteFootnotes notes={pageNotes} numbering={noteNumbering} />

      <section id="coverage" className="mt-8 scroll-mt-4 border-t border-hairline pt-7">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Coverage and data</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
              FY{year} has complete General Fund position and broad money-out coverage
              {budgetSources ? ", plus complete broad money-in coverage" : ""}. Download the
              underlying statement records to inspect the accounting roles, signed values, and
              source citations directly.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs">
            <a
              href="/downloads/v2/statement-members.csv"
              download
              className="underline decoration-dotted underline-offset-4 hover:text-accent"
            >
              Statement lines CSV
            </a>
            <a
              href="/downloads/v2/statement-instances.csv"
              download
              className="underline decoration-dotted underline-offset-4 hover:text-accent"
            >
              Reconciliations CSV
            </a>
            <a
              href="/downloads/v2/scope-coverage.csv"
              download
              className="underline decoration-dotted underline-offset-4 hover:text-accent"
            >
              Coverage CSV
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
