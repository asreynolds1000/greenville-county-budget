import { OTHER_GOVERNMENT_SOURCES } from "@/lib/taxRecipients";
import Link from "@/components/AppLink";
import { EntityYearSharedSlot } from "@/components/EntityYearExplorer";

import { Amount } from "@/components/Amount";
import { ServiceContext } from "@/components/ServiceContext";
import { CorrectionNotice } from "@/components/CorrectionNotice";
import { EntityYearLink } from "@/components/EntityYearLink";
import { GeneralFundShareNote } from "@/components/GeneralFundShareNote";
import { ReportErrorLink } from "@/components/ReportErrorLink";
import { CoverageState } from "@/components/Coverage";
import { StatusBadge } from "@/components/StatusBadge";
import { NoteCallouts, NoteExplanations, NoteFootnotes, NoteMark, numberNotes, splitNotesByContract } from "@/components/DataNotes";
import { getGeneralFundShareContext } from "@/lib/generalFundShare";
import { formatShare, shareOfTotal } from "@/lib/shares";
import {
  getChildrenForYear,
  getEntityNotes,
  getSources,
  noteAppliesToYear,
  getCoverageScopeFor,
  getCoverageState,
  getEntityPage,
  getEntitySummary,
  getSourceByCode,
  getV2EntitySummary,
  getV2Relationships,
  seriesBreakNotesAt,
} from "@/lib/loaders";
import type {
  CoverageDomain,
  DataNote,
  V2EntityPage,
  V2Relationship,
  V2SeriesPoint,
} from "@/lib/schema";
import { sourceCoversFiscalYear } from "@/lib/sourceYears";
import { describeSourceCode, displayName } from "@/lib/format";

/**
 * One accounting line, at the honesty minimum (cold-review finding F5).
 *
 * What this page was: a value, a citation, and a descending table of amounts. What a
 * reader could not tell from it — and what each addition below exists to fix:
 *
 * - which document each row came from (rows span six budget books; one citation at the
 *   top of the page silently attributes all of them to the latest);
 * - that FY2005 to FY2006 is not a 50% spending increase but a change in what the figure
 *   includes (the break marker, from the note layer);
 * - that a year with no row is unpublished rather than zero, and that a dash treated as
 *   zero for arithmetic is visibly marked (all three states render differently);
 * - what the site does and does not cover for the fund this line belongs to;
 * - how to get the whole series with its sources, without scraping the page.
 *
 * Trend charts and share-of-parent remain deliberately absent. Related links are shown only
 * when a curated relationship says what the two presentations mean and warns against adding
 * them together.
 */

const ROLE_DOMAIN: Record<string, CoverageDomain> = {
  revenue: "inflow",
  financing_in: "inflow",
  beginning_position: "position",
  ending_position: "position",
  net_position_change: "position",
  position_adjustment: "position",
  position_component: "position",
  operating_use: "outflow",
  financing_out: "outflow",
  net_financing: "outflow",
  container: "outflow",
  scope_total: "outflow",
};

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The kind of series a break note has to match, so a department break never marks a revenue line. */
function seriesKindFor(entityId: string): string | undefined {
  if (entityId.startsWith("dept.") || entityId.startsWith("opcat.")) return "department";
  return undefined;
}

/**
 * The label the county actually printed that year, when it is not the one at the top of
 * the page.
 *
 * Some lines are printed under more than one label across the years: OCR damage
 * ("MEDICA L EXA MINER"), an outright typo ("Medical Examienr", "Non-Departmenatl"), or a
 * genuine change of wording ("Public Works Administration" to "Public Works
 * Administrator"). Those all resolve to one entity so the series is continuous instead of
 * being split into two half-histories with a false "Not published" gap between them.
 *
 * But resolving them silently would mean this site had quietly edited the source. The
 * printed label is therefore shown on the rows where it differs, which is the whole
 * transcription promise: the county's document governs, and a reader can see what it said.
 *
 * Compared loosely on purpose. Case and the county's OCR word-splitting are not
 * differences a reader needs flagged on every row of a fifteen-year table; a different
 * WORD is.
 */
function printedLabelDiffers(printed: string, entityName: string): boolean {
  const flatten = (value: string) =>
    value
      .toLowerCase()
      // The county prints operating-category subtotal rows as "TOTAL PUBLIC WORKS", and
      // sometimes with a trailing "$". That is a row convention, not a different name for
      // the line, and flagging it would put "printed as" on every row of every category
      // page — the exact noise this is meant to avoid. A genuine typo inside the label
      // still differs after stripping it: "TOTAL EMERGENECY MANAGEMENT $" is still not
      // "Emergency Management".
      .replace(/^to\s*tal\b/, "")
      .replace(/\$$/, "")
      .replace(/[^a-z0-9]+/g, "");
  return flatten(printed) !== flatten(entityName);
}

function CitationCell({ point, rowYear }: { point: V2SeriesPoint; rowYear: number }) {
  if (!point.citation) {
    return <span className="text-ink-faint">—</span>;
  }
  const source = getSourceByCode(point.citation.source_code);
  const isLaterBook = !sourceCoversFiscalYear(point.citation.source_code, rowYear);
  const page = point.citation.printed_page !== null ? `, p.${point.citation.printed_page}` : "";

  return (
    <a
      href={point.citation.source_url}
      target="_blank"
      rel="noreferrer"
      title={source?.document_title_version ?? describeSourceCode(point.citation.source_code)}
      className="underline decoration-dotted underline-offset-2 hover:text-accent"
    >
      {/* Latest-book-wins is correct policy, but a bare later year under an earlier figure
          reads like an error to a resident checking the source (finding F8). */}
      {isLaterBook ? "as printed in " : ""}
      {describeSourceCode(point.citation.source_code)}
      {page}
    </a>
  );
}

type Row =
  | {
      kind: "year";
      fiscalYear: number;
      points: { point: V2SeriesPoint; statusChanged: boolean }[];
    }
  | { kind: "unpublished"; fiscalYear: number }
  | { kind: "break"; fiscalYear: number; noteId: string; headline: string; text: string };

/**
 * The history table's rows, in descending year order, with the gaps and the breaks in it.
 *
 * Built as data rather than rendered inline because the three things that make it honest —
 * a year with nothing in it, a year whose status changed, and a boundary the series must
 * not be read across — are all statements about the RELATIONSHIP between adjacent years,
 * and are unstatable one row at a time.
 */
function buildRows(page: V2EntityPage): Row[] {
  const years = [...new Set(page.series.map((point) => point.fiscal_year))];
  if (years.length === 0) return [];
  const first = Math.min(...years);
  const last = Math.max(...years);
  const kind = seriesKindFor(page.entity_id);

  const byYear = new Map<number, V2SeriesPoint[]>();
  for (const point of page.series) {
    byYear.set(point.fiscal_year, [...(byYear.get(point.fiscal_year) ?? []), point]);
  }

  const statusesOf = (year: number) =>
    new Set((byYear.get(year) ?? []).map((point) => point.status_class));

  const rows: Row[] = [];
  for (let year = last; year >= first; year--) {
    const points = [...(byYear.get(year) ?? [])].sort((a, b) =>
      a.status_class.localeCompare(b.status_class));

    if (points.length === 0) {
      // An interior year with no published value. Rendered, not skipped: a table that
      // simply omits it lets the eye read the two neighbouring years as consecutive.
      rows.push({ kind: "unpublished", fiscalYear: year });
    } else {
      const previous = statusesOf(year - 1);
      rows.push({
        kind: "year",
        fiscalYear: year,
        points: points.map((point) => ({
          point,
          statusChanged: previous.size > 0 && !previous.has(point.status_class),
        })),
      });
    }

    // The break sits BELOW the year it breaks at, because the table runs newest first and
    // the break belongs between that year and the older one it is not comparable with.
    // Both scopes: a county-wide reorganisation is scoped to the series KIND, while a
    // single line absorbing its own sub-lines is scoped to that entity alone.
    for (const note of seriesBreakNotesAt(year, kind, page.entity_id)) {
      rows.push({
        kind: "break",
        fiscalYear: year,
        noteId: note.note_id,
        headline: note.headline,
        text: note.text,
      });
    }
  }
  return rows;
}

/**
 * Where this line came from, and what it became.
 *
 * The county renames departments. ENG.-SOUTHERN BUREAU became ENGINEERING - SOUTHERN
 * BUREAU; GEOGRAPHIC INFORMATION SYSTEM gained an S. Without a link, following one of those
 * across the rename means knowing to search for the other name, which a resident has no
 * reason to guess.
 *
 * Phrased as continuation, never as equivalence, and it deliberately does not merge or sum
 * the two series. The evidence for the claim travels with it — the county's own printed
 * labels either side, and what the figure did across the boundary — because "these are the
 * same line" is exactly the kind of assertion that should carry its reasoning. Whether the
 * figures are actually comparable is a separate question the break notes answer.
 */
function SuccessionLinks({ page }: { page: V2EntityPage }) {
  const { preceded_by: from, succeeded_by: to } = page;
  if (!from && !to) return null;

  return (
    <div className="mt-4 space-y-2 border-l-2 border-l-accent/30 pl-3.5">
      {from && (
        <p className="text-sm leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Continues from</span>{" "}
          <Link
            href={`/e/${from.entity_id}/`}
            className="text-accent underline decoration-dotted underline-offset-2"
          >
            {displayName(getV2EntitySummary(from.entity_id)) || from.entity_id}
          </Link>
          {from.from_fiscal_year !== null && `, through FY${from.from_fiscal_year}`}. {from.note}
        </p>
      )}
      {to && (
        <p className="text-sm leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Continues as</span>{" "}
          <Link
            href={`/e/${to.entity_id}/`}
            className="text-accent underline decoration-dotted underline-offset-2"
          >
            {displayName(getV2EntitySummary(to.entity_id)) || to.entity_id}
          </Link>
          {to.to_fiscal_year !== null && `, from FY${to.to_fiscal_year}`}. {to.note}
        </p>
      )}
    </div>
  );
}

function relationshipApplies(rel: V2Relationship, year: number): boolean {
  return (rel.effective_from_fy === null || rel.effective_from_fy <= year)
    && (rel.effective_to_fy === null || year <= rel.effective_to_fy);
}

/**
 * Curated navigation between lines that illuminate each other without forming an equation.
 *
 * `related_to` is reciprocal for navigation even though the stored row has stable from/to
 * endpoints. It is never traversed by rollups, and the reader sees the restriction and mapping
 * note rather than a bare link that could imply the two figures are interchangeable.
 */
function RelatedLines({ page, year }: { page: V2EntityPage; year: number }) {
  const relationships = getV2Relationships().filter((rel) => (
    rel.relationship_type === "related_to"
    && relationshipApplies(rel, year)
    && (rel.from_entity_id === page.entity_id || rel.to_entity_id === page.entity_id)
  ));
  if (relationships.length === 0) return null;

  return (
    <section className="mt-4 border-l-2 border-l-accent/30 pl-3.5" data-related-lines="true">
      <h2 className="font-mono text-xs tracking-[0.16em] text-ink-secondary uppercase">
        {relationships.length === 1 ? "Related line" : "Related lines"}
      </h2>
      <div className="mt-2 space-y-3">
        {relationships.map((rel) => {
          const otherId = rel.from_entity_id === page.entity_id
            ? rel.to_entity_id
            : rel.from_entity_id;
          const other = getV2EntitySummary(otherId);
          const source = rel.source_code ? getSourceByCode(rel.source_code) : undefined;

          return (
            <div key={rel.relationship_id} data-relationship-id={rel.relationship_id}>
              <p className="text-sm leading-relaxed text-ink-secondary">
                <EntityYearLink
                  entityId={otherId}
                  fiscalYear={year}
                  className="font-medium text-accent underline decoration-dotted underline-offset-2"
                >
                  {displayName(other) || otherId}
                </EntityYearLink>
                {rel.relationship_note && <> — {rel.relationship_note}</>}
              </p>
              {(rel.restriction_note || source) && (
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {rel.restriction_note}
                  {rel.restriction_note && source && " "}
                  {source && rel.source_code && (
                    <a
                      href={source.official_url}
                      target="_blank"
                      rel="noreferrer"
                      title={source.document_title_version}
                      className="underline decoration-dotted underline-offset-2 hover:text-accent"
                    >
                      Source: {describeSourceCode(rel.source_code)}
                    </a>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A comparability break, in whichever presentation is rendering it.
 *
 * The text is never shortened for the phone. A break is the one row on this page that
 * exists to stop a reader drawing a line through two figures that cannot be compared, and
 * an abbreviated version of that warning is not a smaller warning — it is a different one.
 */
function BreakNote({ headline, text, noteId }: { headline: string; text: string; noteId: string }) {
  return (
    <>
      <span className="font-medium text-ink">{headline}</span>{" "}
      <span className="text-ink-secondary">{text}</span>{" "}
      <Link
        href={`/methodology/#note-${noteId.replace(/[^a-z0-9]+/gi, "-")}`}
        className="whitespace-nowrap text-accent underline decoration-dotted underline-offset-2"
      >
        Why this is recorded
      </Link>
    </>
  );
}

/**
 * The history as stacked ledger rows, for viewports too narrow for four columns.
 *
 * The desktop table puts the source in a fourth column that sits ~39px outside a 320px
 * viewport, behind `overflow-x-auto` with no visible affordance — so on a phone the field
 * this whole site exists to provide is the one field a reader cannot see.
 *
 * Rendered as a second DOM tree from the SAME `buildRows()` result rather than by
 * restyling the table's own elements. `display: none` removes the hidden tree from the
 * accessibility tree entirely, so exactly one presentation is ever announced; restyling
 * `<tr>`/`<td>` to `display: block` would instead strip the table semantics that are
 * correct and useful on desktop.
 */
function HistoryLedger({ page, rows, notes, numbering }: {
  page: V2EntityPage; rows: Row[]; notes: DataNote[]; numbering: Map<string, number>;
}) {
  return (
    <ol className="mt-5 divide-y divide-hairline border-t border-ink/20 sm:hidden">
      {rows.map((row) => {
        if (row.kind === "break") {
          return (
            <li
              key={`m-break-${row.fiscalYear}-${row.noteId}`}
              // Indented and tinted so it reads as a boundary between years rather than as
              // another year.
              className="border-l-2 border-l-accent/40 bg-surface py-3 pl-3 text-sm leading-relaxed"
            >
              <BreakNote headline={row.headline} text={row.text} noteId={row.noteId} />
            </li>
          );
        }

        if (row.kind === "unpublished") {
          return (
            <li key={`m-gap-${row.fiscalYear}`} className="flex items-baseline justify-between py-2.5">
              <span className="font-mono text-ink-faint">FY{row.fiscalYear}</span>
              <span className="text-sm text-ink-faint">Not published</span>
            </li>
          );
        }

        return (
          <li key={`m-${row.fiscalYear}`} className="py-3">
            <Link
              href={`/e/${page.entity_id}/?fy=${row.fiscalYear}`}
              className="font-mono underline decoration-hairline underline-offset-4 hover:text-accent"
            >
              FY{row.fiscalYear}
            </Link>
            <div className="mt-1 divide-y divide-hairline/70">
              {row.points.map(({ point, statusChanged }) => (
                <div
                  key={`${point.status_class}-${point.measure_type}`}
                  className="py-1.5 first:pt-1"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-ink-secondary">
                      {titleCase(point.status_class)}
                    </span>
                    <span className="font-mono tabular-nums text-ink">
                      <Amount value={point.value} printedForm={point.printed_form} />
                      <NoteMark
                        notes={notes.filter((note) => noteAppliesToYear(note, row.fiscalYear, point.status_class))}
                        numbering={numbering}
                      />
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-secondary">
                    <span className="font-mono">
                      <CitationCell point={point} rowYear={row.fiscalYear} />
                    </span>
                    {point.citation
                      && printedLabelDiffers(point.citation.original_label, displayName(page)) && (
                      <span className="basis-full font-mono text-[10px] text-ink-faint">
                        printed as &ldquo;{point.citation.original_label}&rdquo;
                      </span>
                    )}
                  </div>
                  {statusChanged && (
                    <p className="mt-1 font-mono text-[10px] text-ink-faint uppercase">
                      basis changes below
                    </p>
                  )}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function V2EntityYearView({ page, year }: {
  page: V2EntityPage; year: number;
}) {
  const current = page.series.filter((point) => point.fiscal_year === year);
  const statuses = [...new Set(current.map((point) => point.status_class))];

  // Caveats attached to this specific line. Marked against the years they describe and
  // listed once at the foot, which is the pattern the General Fund page already uses:
  // a caveat that floats free of its number is decoration.
  const entityNotes = getEntityNotes(page.entity_id);
  const noteNumbering = numberNotes(entityNotes);
  // `callout` and `explanation` render themselves, in full, beside the figure they qualify.
  // They must not also appear as a superscript pointing at text already on screen.
  const { callouts, explanations } = splitNotesByContract(entityNotes);
  const calloutsThisYear = callouts.filter((note) => noteAppliesToYear(note, year));
  const explanationsThisYear = explanations.filter((note) => noteAppliesToYear(note, year));
  // Resolved here, on the server, so the note renderer never reaches for the filesystem.
  const sourceLinks = Object.fromEntries(
    getSources().map((source) => [source.source_code, source.official_url]),
  );

  // The v1 page is where the era-correct child list lives; entities added with the
  // accounting model (balances, financing) have no v1 page and no children.
  const children = getEntitySummary(page.entity_id)
    ? getChildrenForYear(getEntityPage(page.entity_id), year)
    : [];

  // Scoped to gf.expenditures only -- the General Fund's own category breakdown, the same
  // list /compare/ calls "categories" -- and not to every entity this children list ever
  // renders for. Extending it to every General-Fund-scoped department page would move
  // already-reviewed page baselines (opcat.public-works, dept.sheriff, ...) that this change
  // does not otherwise touch; see napkin.
  const generalFundShareContext =
    page.entity_id === "gf.expenditures" ? getGeneralFundShareContext(year) : null;

  const scopeEntityId = getCoverageScopeFor(page.entity_id);
  const scopeName = scopeEntityId ? displayName(getV2EntitySummary(scopeEntityId)) : null;
  const domain = ROLE_DOMAIN[page.accounting.accounting_role];
  const coverage = scopeEntityId && domain
    ? getCoverageState(scopeEntityId, domain, year)
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-secondary">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          County budget
        </Link>
        {scopeEntityId && (
          <>
            <span aria-hidden="true"> / </span>
            <EntityYearLink
              entityId={scopeEntityId}
              fiscalYear={year}
              className="underline decoration-dotted underline-offset-2 hover:text-accent"
            >
              {/* The fund this line belongs to, resolved from the data rather than assumed
                  to be the General Fund — which the hardcoded breadcrumb here used to do,
                  on a view that can also render special revenue lines. */}
              {scopeName ?? scopeEntityId}
            </EntityYearLink>
          </>
        )}
      </nav>

      <header className="mt-7 border-b border-hairline pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs tracking-[0.16em] text-accent uppercase">
            FY{year} · {titleCase(page.accounting.accounting_role)}
          </p>
          {statuses.map((status) => <StatusBadge key={status} label={titleCase(status)} />)}
        </div>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {displayName(page)}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-secondary">
          {page.plain_language_description}
        </p>
        {page.entity_id === "use.enterprise.solid-waste" && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-secondary">
            These figures cover Greenville County&rsquo;s landfill and solid-waste account, not Greater Greenville Sanitation&rsquo;s household collection service.{" "}
            <a href={OTHER_GOVERNMENT_SOURCES.sanitation.url} className="text-accent underline underline-offset-2">Greater Greenville Sanitation: services and official information →</a>
          </p>
        )}
        {page.restriction_note && (
          <p className="mt-4 rounded-md border border-hairline bg-surface p-3 text-sm text-ink-secondary">
            {page.restriction_note}
          </p>
        )}

        <SuccessionLinks page={page} />
        <RelatedLines page={page} year={year} />
      </header>

      <section className="mt-8">
        <h2 className="font-mono text-xs tracking-[0.16em] text-ink-secondary uppercase">FY{year}</h2>
        {current.length === 0 ? (
          <p className="mt-3 text-ink-secondary">No value was published for this line in FY{year}.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {current.map((point) => (
              <article
                key={`${point.status_class}-${point.measure_type}`}
                className="rounded-lg border border-hairline bg-surface p-5"
                data-canonical-value={[
                  page.entity_id,
                  year,
                  point.status_class,
                  point.measure_type,
                ].join("|")}
              >
                <p className="font-mono text-xs text-ink-secondary uppercase">
                  {titleCase(point.status_class)}
                </p>
                <p className="mt-2 font-display text-4xl font-semibold tabular-nums">
                  <Amount value={point.value} printedForm={point.printed_form} />
                  <NoteMark
                    notes={entityNotes.filter((note) => noteAppliesToYear(note, year, point.status_class))}
                    numbering={noteNumbering}
                  />
                </p>
                <p className="mt-3 font-mono text-xs text-ink-secondary">
                  <CitationCell point={point} rowYear={year} />
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <NoteCallouts notes={calloutsThisYear} />
      <NoteExplanations notes={explanationsThisYear} sourceLinks={sourceLinks} />

      <div className="mt-5"><ServiceContext entityId={page.entity_id} fiscalYear={year} /></div>

      {children.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            What makes it up (FY{year})
          </h2>
          {generalFundShareContext && (
            <GeneralFundShareNote context={generalFundShareContext} year={year} />
          )}
          <ul className="mt-4 divide-y divide-hairline">
            {children.map((child) => {
              const share = generalFundShareContext?.supported && child.value !== null && generalFundShareContext.fundTotal
                ? shareOfTotal(child.value, generalFundShareContext.fundTotal)
                : null;
              return (
                <li key={child.entity_id} className="flex items-baseline justify-between gap-4 py-2.5">
                  <EntityYearLink
                    entityId={child.entity_id}
                    fiscalYear={year}
                    className="underline decoration-hairline underline-offset-4 hover:text-accent"
                  >
                    {displayName(child)}
                  </EntityYearLink>
                  {generalFundShareContext ? (
                    <span className="flex flex-col items-end">
                      <span className="font-mono tabular-nums">
                        <Amount value={child.value} printedForm={child.printed_form} />
                      </span>
                      {share !== null && (
                        <span className="font-mono text-xs text-ink-secondary tabular-nums">
                          {formatShare(share)} of the General Fund
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono tabular-nums">
                      <Amount value={child.value} printedForm={child.printed_form} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* A one-year category still has something concrete to explain: its composition.
          Keep it ahead of a comparison that may correctly say there is no earlier value. */}
      <EntityYearSharedSlot name="chart" />

      <CorrectionNotice entityId={page.entity_id} fiscalYear={year} />
      <p className="mt-5 text-sm text-ink-secondary">
        Does a figure or citation look wrong?{" "}
        <ReportErrorLink
          pagePath={`/e/${page.entity_id}/?fy=${year}`}
          fiscalYear={year}
          entityId={page.entity_id}
          className="font-medium text-accent underline decoration-dotted underline-offset-2"
        />
      </p>

      {coverage && (
        <section className="mt-10">
          <CoverageState
            title={`What this site covers for the ${scopeName ?? "fund"}`}
            href={scopeEntityId ? `/e/${scopeEntityId}/?fy=${year}` : undefined}
            coverage={coverage}
          />
        </section>
      )}

      <EntityYearSharedSlot name="ledger" />
    </main>
  );
}

/** Complete cross-year ledger: serialized once, including citations and footnotes. */
export function V2EntityHistory({ page }: { page: V2EntityPage }) {
  const rows = buildRows(page);
  const entityNotes = getEntityNotes(page.entity_id);
  const noteNumbering = numberNotes(entityNotes);
  return <>
      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight">History</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          Every year this line appears, with the document each figure was read from. Years
          with nothing published say so; they are never turned into zero. A numeric zero is
          shown as $0. When the county printed a dash, † marks the site&rsquo;s arithmetic-zero
          representation.
        </p>
        <HistoryLedger page={page} rows={rows} notes={entityNotes} numbering={noteNumbering} />

        {/* The table is the right presentation the moment four columns fit, and it stays
            the desktop one: real table semantics, sortable by eye, scannable down a column. */}
        <div className="mt-5 hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              {displayName(page)}: every published year, its status, amount and source
            </caption>
            <thead>
              <tr className="border-b border-ink/20 text-left font-mono text-[11px] tracking-wide text-ink-secondary uppercase">
                <th scope="col" className="py-2 pr-4 font-normal">Year</th>
                <th scope="col" className="py-2 pr-4 font-normal">Status</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Amount</th>
                <th scope="col" className="py-2 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === "break") {
                  return (
                    <tr key={`break-${row.fiscalYear}`} className="border-b border-ink/20">
                      <td colSpan={4} className="bg-surface px-3 py-3 text-sm leading-relaxed">
                        <BreakNote
                          headline={row.headline}
                          text={row.text}
                          noteId={row.noteId}
                        />
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "unpublished") {
                  return (
                    <tr key={`gap-${row.fiscalYear}`} className="border-b border-hairline">
                      <th scope="row" className="py-2.5 pr-4 text-left font-normal font-mono text-ink-faint">
                        FY{row.fiscalYear}
                      </th>
                      <td className="py-2.5 pr-4 text-ink-faint" colSpan={3}>
                        Not published
                      </td>
                    </tr>
                  );
                }
                return row.points.map(({ point, statusChanged }, index) => (
                    <tr
                      key={`${row.fiscalYear}-${point.status_class}-${point.measure_type}`}
                      className="border-b border-hairline"
                    >
                      {index === 0 && (
                        /* One linked year heads every status the county printed for that
                           year. `rowgroup` makes the shared context explicit to a screen
                           reader without merging the separately labelled values. */
                        <th
                          scope={row.points.length > 1 ? "rowgroup" : "row"}
                          rowSpan={row.points.length}
                          className="py-2.5 pr-4 text-left align-top font-normal font-mono"
                        >
                          <Link
                            href={`/e/${page.entity_id}/?fy=${row.fiscalYear}`}
                            className="underline decoration-hairline underline-offset-3 hover:text-accent"
                          >
                            FY{row.fiscalYear}
                          </Link>
                        </th>
                      )}
                      <td className="py-2.5 pr-4 text-ink-secondary">
                        {titleCase(point.status_class)}
                        {/* A status change means the row below answers a different question —
                            what was planned versus what was spent. Unmarked, the column reads
                            as one series. The table runs newest first, so the marker names
                            the direction: the change is between this row and the older one. */}
                        {statusChanged && (
                          <span className="ml-2 font-mono text-[10px] text-ink-faint uppercase">
                            basis changes below
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                        <Amount value={point.value} printedForm={point.printed_form} />
                        <NoteMark
                          notes={entityNotes.filter((note) => noteAppliesToYear(note, row.fiscalYear, point.status_class))}
                          numbering={noteNumbering}
                        />
                      </td>
                      <td className="py-2.5 font-mono text-xs text-ink-secondary">
                        <CitationCell point={point} rowYear={row.fiscalYear} />
                        {point.citation
                          && printedLabelDiffers(point.citation.original_label, displayName(page)) && (
                          <span className="mt-0.5 block text-[10px] text-ink-faint">
                            printed as &ldquo;{point.citation.original_label}&rdquo;
                          </span>
                        )}
                      </td>
                    </tr>
                  ));
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-sm text-ink-secondary">
          <a
            href={`/downloads/series/${page.entity_id}.csv`}
            download
            className="font-medium text-accent underline decoration-dotted underline-offset-2"
          >
            Download this series (CSV)
          </a>{" "}
          — every year, with the source document, printed page and PDF page for each figure.
        </p>
      </section>

      <NoteFootnotes notes={entityNotes} numbering={noteNumbering} />
  </>;
}
