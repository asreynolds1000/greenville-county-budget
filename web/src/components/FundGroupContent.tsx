import { OTHER_GOVERNMENT_SOURCES } from "@/lib/taxRecipients";
import type { ReactNode } from "react";
import type { FundCommon, FundGroupInput } from "@/lib/fundPanelData";
import Link from "@/components/AppLink";

import { Amount } from "@/components/Amount";
import { FundEntityYearLink as EntityYearLink } from "@/components/FundEntityYearLink";
import { ReportErrorLink } from "@/components/ReportErrorLink";
import { CoverageState } from "@/components/Coverage";
import { Provenance, type ProvenanceSource } from "@/components/Provenance";
import { StatusBadge } from "@/components/StatusBadge";
import type { Citation, V2Statement } from "@/lib/schema";
import { displayName } from "@/lib/format";

/**
 * A fund group at the level the record actually supports.
 *
 * The General Fund has its own page because it is the only fund this site covers end to
 * end. The other three had the Step 3 placeholder: a number, the word "adopted", and an
 * unlabelled list. That page implied parity it does not have — nothing on it said that the
 * county raises money for these funds and this site has not extracted a dollar of it.
 *
 * So this view is the same three questions as the county overview and the General Fund
 * page, in the same order, answered honestly per fund: money in, where it sits, money out.
 * Two of the three usually answer "not covered", in words, at the same weight as the one
 * that carries a number.
 *
 * Every state here is read from `scope_coverage`. There is no hardcoded sentence about
 * what a fund does or does not have, which is what makes the claim maintainable: when the
 * special revenue funds' revenue is finally extracted, this page changes because the data
 * changed, and the pipeline gate will have failed the build until the claim was corrected.
 */

function statusLabelFor(statusClass: string): string {
  if (statusClass === "adopted") return "Adopted";
  if (statusClass === "actual") return "Actual";
  if (statusClass === "projected") return "Projected";
  if (statusClass === "financing") return "Financing";
  return "Estimated";
}

function provenanceFor(
  common: FundCommon,
  citation: Citation,
  statusClass: string,
  pageFiscalYear: number,
): ProvenanceSource {
  const source = common.sources[citation.source_code];
  return {
    sourceCode: citation.source_code,
    bookTitle: source?.document_title_version ?? citation.source_code,
    printedPage: citation.printed_page,
    url: citation.source_url,
    statusLabel: statusLabelFor(statusClass),
    archiveUrl: source?.archive_url,
    archivedOn: source?.archived_on,
    pageFiscalYear,
  };
}

type StatementMember = V2Statement["instances"][number]["members"][number];

function StatementMemberRows({ common, members, year }: { common: FundCommon; members: StatementMember[]; year: number }) {
  if (members.length === 0) return null;
  return (
    <ul className="divide-y divide-hairline">
      {members.map((member) => {
        const entity = common.entities[member.entity_id];
        return (
          <li key={member.entity_id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <EntityYearLink common={common}
                entityId={member.entity_id}
                fiscalYear={year}
                className="font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent"
              >
                {entity ? displayName(entity) : member.entity_id}
              </EntityYearLink>
              <span className="font-mono tabular-nums text-ink">
                <Amount value={member.value} printedForm={member.printed_form} />
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {member.resolved_status_class && (
                <StatusBadge label={statusLabelFor(member.resolved_status_class)} />
              )}
              {member.citation && (
                <Provenance
                  source={provenanceFor(common, member.citation, member.resolved_status_class ?? "adopted", year)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One named sub-fund, with the page and printed page it was read from. */
function SubFundRow({ common, row, year }: { common: FundCommon; row: FundGroupInput["children"][number]; year: number }) {
  const { entity_id: entityId, label: page, point } = row;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <EntityYearLink common={common}
          entityId={entityId}
          fiscalYear={year}
          className="font-medium text-ink underline decoration-hairline underline-offset-4 hover:text-accent"
        >
          {displayName(page)}
        </EntityYearLink>
        <span className="font-mono tabular-nums text-ink">
          <Amount value={point?.value ?? null} printedForm={point?.printed_form ?? null} />
        </span>
      </div>
      {/* Per-row provenance, not one citation for the whole table. These funds are read
          from different pages of the same book, and a reader checking one of them needs
          the page that figure is actually printed on. */}
      {point && <Provenance source={provenanceFor(common, point.citation, point.status_class, year)} className="mt-1" />}
    </li>
  );
}

export function FundGroupContent({ input, common, correction, history, yearSelector }: {
  input: FundGroupInput; common: FundCommon; correction: ReactNode; history: ReactNode; yearSelector: ReactNode;
}) {
  const { year, page, value, point } = input;
  const entityId = page.entity_id;
  const children = [...input.children].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const childrenTotal = children.reduce((sum, child) => sum + (child.value ?? 0), 0);
  const { inflow, position, outflow } = input.coverage;
  const { inflow: inflowMembers, position: positionMembers, outflow: outflowMembers } = input.members;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <p className="font-mono text-xs text-ink-secondary">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Total Budget
        </Link>
        <span aria-hidden="true"> / </span>
        {displayName(page)}
      </p>

      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
        {displayName(page)}
      </h1>
      <p className="mt-1 font-mono text-xs tracking-widest text-ink-secondary uppercase">
        Fiscal year {year}
      </p>
      {yearSelector}
      {page.plain_language_description && (
        <p className="mt-4 max-w-2xl leading-relaxed text-ink">{page.plain_language_description}.</p>
      )}

      {entityId === "fund.enterprise" && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          The solid-waste figures here cover Greenville County&rsquo;s landfill and solid-waste account, not Greater Greenville Sanitation&rsquo;s household collection service.{" "}
            <a href={OTHER_GOVERNMENT_SOURCES.sanitation.url} className="text-accent underline underline-offset-2">Greater Greenville Sanitation: services and official information →</a>
        </p>
      )}

      {entityId === "fund.debt-service" && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          These are Greenville County debt payments. Greenville County Schools&rsquo; finances are outside this explorer.{" "}
          <a href={OTHER_GOVERNMENT_SOURCES.schoolsDebt.url} className="text-accent underline underline-offset-2">Greenville County Schools: debt and capital projects →</a>
        </p>
      )}

      <section className="mt-8 border-t border-hairline pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
            Authorized to spend
          </p>
          {point && <StatusBadge label={statusLabelFor(point.status_class)} />}
        </div>
        <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink tabular-nums">
          <Amount value={value} printedForm={point?.printed_form ?? null} />
        </p>
        {point && <Provenance source={provenanceFor(common, point.citation, point.status_class, year)} className="mt-2" />}
        <p className="mt-3 text-sm"><a href="#change-over-time" className="text-accent underline underline-offset-4">Compare this fund across years →</a></p>
      </section>

      {correction}
      <p className="mt-5 text-sm text-ink-secondary">
        Does a figure or citation look wrong?{" "}
        <ReportErrorLink
          pagePath={`/e/${page.entity_id}/?fy=${year}`}
          fiscalYear={year}
          entityId={page.entity_id}
          className="font-medium text-accent underline decoration-dotted underline-offset-2"
        />
      </p>

      <section className="mt-10 grid gap-6 border-t border-hairline pt-8">
        <CoverageState title="Money in" coverage={inflow}>
          <StatementMemberRows common={common} members={inflowMembers} year={year} />
        </CoverageState>
        <CoverageState title="Where it sits" coverage={position}>
          <StatementMemberRows common={common} members={positionMembers} year={year} />
        </CoverageState>
        <CoverageState title="Money out" coverage={outflow}>
          {outflowMembers.length > 0 && (
            <StatementMemberRows common={common} members={outflowMembers} year={year} />
          )}
          {children.length > 0 ? (
            <>
              <p className={`${outflowMembers.length > 0 ? "mt-5 border-t border-ink/20 pt-4" : ""} text-sm font-medium text-ink`}>
                Named funds in the Budget Expenditure Overview
              </p>
              <ul className="divide-y divide-hairline">
                {children.map((child) => (
                  <SubFundRow common={common} key={child.entity_id} row={child} year={year} />
                ))}
              </ul>
              {/* Whether the named funds account for the whole fund total is the reader's
                  first question and it is answerable from the data, so it is answered
                  rather than left to them to add up twelve rows. When they do not sum,
                  saying so is the honest outcome — not hiding the arithmetic. */}
              <p className="mt-3 border-t border-ink/20 pt-3 text-sm text-ink-secondary">
                {childrenTotal === value ? (
                  <>
                    These {children.length} named funds account for the whole{" "}
                    <span className="font-mono tabular-nums text-ink">
                      <Amount value={value} printedForm={point?.printed_form ?? null} />
                    </span>
                    .
                  </>
                ) : (
                  <>
                    These {children.length} named funds come to{" "}
                    <span className="font-mono tabular-nums text-ink">
                      <Amount value={childrenTotal} printedForm={null} />
                    </span>{" "}
                    of the fund&rsquo;s{" "}
                    <span className="font-mono tabular-nums text-ink">
                      <Amount value={value} printedForm={point?.printed_form ?? null} />
                    </span>
                    . The difference is not broken out in the source.
                  </>
                )}
              </p>
            </>
          ) : outflowMembers.length === 0 && outflow.coverage_level !== "unavailable" ? (
            <p className="font-mono text-lg tabular-nums text-ink">
              <Amount value={value} printedForm={point?.printed_form ?? null} />
            </p>
          ) : null}
        </CoverageState>
      </section>

      {history}

      <section className="mt-10 border-t border-hairline pt-6">
        <p className="text-sm text-ink-secondary">
          Every year of this fund&rsquo;s series, with the source and printed page each
          figure was read from:{" "}
          <a
            href={`/downloads/series/${entityId}.csv`}
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            download the full series (CSV)
          </a>
        </p>
      </section>
    </main>
  );
}
