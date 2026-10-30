/**
 * Provenance worn openly (Step 4 design brief) — the app's signature element.
 * Every headline number on the page carries one of these: a quiet, mono-set
 * citation line linking straight to the source book. Renders e.g.
 * "FY2026 · Adopted · County of Greenville Budget Document Fiscal Year 2026, p.35"
 * with the book title linking to the official PDF.
 *
 * Doesn't reach into schema.ts's raw citation shape directly — a Provenance
 * needs the source's book title (from sources.json, a separate file) and a
 * human status label the caller resolves from status_class ("adopted" ->
 * "Adopted"), so this is a synthesized shape rather than a schema pass-through.
 */
import { describeSourceCode } from "@/lib/format";
import { sourceCoversFiscalYear } from "@/lib/sourceYears";

export type ProvenanceSource = {
  sourceCode: string;
  bookTitle: string;
  printedPage: number | null;
  url: string;
  /** Human-readable status, e.g. "Adopted" or "Estimated" — resolved by the caller from status_class. */
  statusLabel: string;
  /**
   * The fiscal year of the page this citation appears on, when the caller knows it.
   *
   * Latest-book-wins is the right policy — the most recent official printing of a figure
   * is the one to cite — but a bare "FY2016-17" under an FY2014 number reads to an
   * attentive resident like a mistake (cold-review finding F8). Passing the page's year
   * lets the line say "as printed in" instead, which is the same fact stated so it does
   * not look like an error.
   */
  pageFiscalYear?: number;
  /**
   * A third-party snapshot of the same document, when one exists.
   *
   * The county link stays primary and is what a reader should follow. This is the fallback
   * for the day it stops resolving — and for a county website, that is a matter of when.
   * Rendered as a quiet secondary link rather than a replacement, because "the Internet
   * Archive captured this on 12 August 2022" is a different and weaker claim than "this is
   * the county's document", and the reader should be able to tell which they are looking at.
   */
  archiveUrl?: string;
  /** YYYYMMDD as the Wayback Machine records it. */
  archivedOn?: string;
};

/** "20220812" -> "12 August 2022". Returns null for anything unexpected. */
function formatArchiveDate(stamp: string | undefined): string | null {
  if (!stamp || !/^\d{8}$/.test(stamp)) return null;
  const date = new Date(
    Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)),
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function Provenance({ source, className = "" }: { source: ProvenanceSource; className?: string }) {
  const pageLabel = source.printedPage !== null ? `, p.${source.printedPage}` : "";
  const isLaterBook = source.pageFiscalYear !== undefined
    && !sourceCoversFiscalYear(source.sourceCode, source.pageFiscalYear);

  return (
    <p className={`font-mono text-xs text-ink-secondary ${className}`}>
      {isLaterBook ? "as printed in " : ""}
      {describeSourceCode(source.sourceCode)} · {source.statusLabel} ·{" "}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-accent"
      >
        {source.bookTitle}
      </a>
      {pageLabel}
      {source.archiveUrl && (
        <>
          {" · "}
          <a
            href={source.archiveUrl}
            target="_blank"
            rel="noreferrer"
            title={
              formatArchiveDate(source.archivedOn)
                ? `Third-party snapshot captured ${formatArchiveDate(source.archivedOn)}. Use `
                  + `this if the county's own link no longer resolves.`
                : "Third-party snapshot, for use if the county's own link no longer resolves."
            }
            className="text-ink-faint underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            archived copy
          </a>
        </>
      )}
    </p>
  );
}
