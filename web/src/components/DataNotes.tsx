import type { DataNote } from "@/lib/schema";

/**
 * Contracts that render themselves, and must therefore never also be numbered footnotes.
 *
 * A `callout` has to survive a screenshot of the figure it qualifies, and an `explanation` is
 * a disclosure a reader opens. Both would be actively misleading as a superscript: the mark
 * says "there is a caveat somewhere below" about text that is already on screen in full.
 */
const SELF_RENDERING_CONTRACTS = new Set(["callout", "explanation"]);

function isSelfRendering(note: DataNote): boolean {
  return SELF_RENDERING_CONTRACTS.has(note.render_contract);
}

/**
 * True when a note's declared year range reaches any year in [first, last]. The single-year
 * form lives in loaders.ts beside the filesystem; this one exists so a client component can
 * ask the same question of a chart window without importing node:fs.
 */
export function noteAppliesToYears(note: DataNote, first: number, last: number): boolean {
  return (note.fiscal_year_start === null || note.fiscal_year_start <= last)
    && (note.fiscal_year_end === null || note.fiscal_year_end >= first);
}

/** Split a page's notes by who renders them, so no caller has to remember the rule. */
export function splitNotesByContract(notes: DataNote[]): {
  callouts: DataNote[];
  explanations: DataNote[];
  footnotes: DataNote[];
} {
  return {
    callouts: notes.filter((note) => note.render_contract === "callout"),
    explanations: notes.filter((note) => note.render_contract === "explanation"),
    footnotes: notes.filter((note) => !isSelfRendering(note)),
  };
}

/**
 * The caveat layer, rendered as footnotes.
 *
 * An earlier version placed each caveat where it applied, as expandable blocks and inline
 * paragraphs. Everything was findable and the page was cluttered, which is its own failure:
 * a reader who skims past twelve boxes has been told nothing.
 *
 * So the marks are small and the text lives in one place at the foot of the page. What the
 * marks must keep doing is pointing at the specific figure they qualify, because a caveat
 * that floats free of its number is decoration.
 *
 * These components render notes. They do not satisfy structural obligations: a
 * `series_split` note is discharged by a chart splitting its series, not by a footnote
 * mark next to it.
 */

/** Stable per-page numbering, so a mark and its footnote always agree. */
export function numberNotes(notes: DataNote[]): Map<string, number> {
  const ordered = [...notes].filter((note) => !isSelfRendering(note))
    .sort((a, b) => a.note_id.localeCompare(b.note_id));
  return new Map(ordered.map((note, index) => [note.note_id, index + 1]));
}

export function noteAnchor(noteId: string): string {
  return `note-${noteId.replace(/[^a-z0-9]+/gi, "-")}`;
}

/** The superscript mark shown against a figure, heading or line. */
export function NoteMark({
  notes,
  numbering,
}: {
  notes: DataNote[];
  numbering: Map<string, number>;
}) {
  const marks = notes
    .map((note) => ({ note, index: numbering.get(note.note_id) }))
    .filter((entry): entry is { note: DataNote; index: number } => entry.index !== undefined)
    .sort((a, b) => a.index - b.index);
  if (marks.length === 0) return null;
  return (
    <sup className="ml-0.5 font-mono text-[10px] font-normal text-ink-faint">
      {marks.map(({ note, index }, position) => (
        <span key={note.note_id}>
          {position > 0 && <span aria-hidden="true">,</span>}
          <a
            href={`#${noteAnchor(note.note_id)}`}
            className="hover:text-accent"
            aria-label={`Note ${index}: ${note.headline}`}
            data-note-id={note.note_id}
          >
            {index}
          </a>
        </span>
      ))}
    </sup>
  );
}

/** Every caveat that applies to this page, once, at the foot. */
export function NoteFootnotes({
  notes,
  numbering,
}: {
  notes: DataNote[];
  numbering: Map<string, number>;
}) {
  // Filter here rather than trusting the numbering to hide them. This component iterates
  // whatever it is handed, so an unnumbered note previously rendered anyway — as a footnote
  // with an empty number, duplicating text the page already shows in full somewhere else.
  const listed = notes.filter((note) => !isSelfRendering(note));
  if (listed.length === 0) return null;
  const ordered = [...listed].sort(
    (a, b) => (numbering.get(a.note_id) ?? 0) - (numbering.get(b.note_id) ?? 0),
  );
  return (
    <section className="mt-10 border-t border-hairline pt-4" aria-labelledby="page-notes-title">
      <h3
        id="page-notes-title"
        className="font-mono text-[11px] tracking-[0.14em] text-ink-faint uppercase"
      >
        Notes on these figures
      </h3>
      <ol className="mt-3 grid gap-2">
        {ordered.map((note) => (
          <li
            key={note.note_id}
            id={noteAnchor(note.note_id)}
            data-note-footnote-id={note.note_id}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline text-xs leading-relaxed"
          >
            <span className="font-mono text-[10px] text-ink-faint">
              {numbering.get(note.note_id)}
            </span>
            <span>
              <strong className="font-medium">{note.headline}.</strong>{" "}
              <span className="text-ink-secondary">{note.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A caveat rendered in full, beside the figure it qualifies.
 *
 * This is the `callout` contract. It exists because the footnote layer fails exactly where it
 * matters most: a reader who crops a chart, or screenshots a headline number, takes the figure
 * and leaves the superscript behind. So a callout is placed where the figure is, and inside
 * the chart's own frame, and it carries its whole text rather than a pointer to it.
 */
export function NoteCallouts({ notes }: { notes: DataNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div data-note-callouts className="mt-4 border-l-2 border-l-accent/40 pl-3 text-sm leading-relaxed text-ink-secondary">
      {notes.map((note) => (
        <p key={note.note_id} data-note-callout-id={note.note_id} className="first:mt-0 mt-2">
          <strong className="font-medium text-ink">{note.headline}.</strong>{" "}
          {note.text}
        </p>
      ))}
    </div>
  );
}

/** A `FY####` or `FY####-##` token, the form every source_code in sources.json takes. */
const SOURCE_CODE = /\bFY\d{4}(?:-(?:\d{2}|ACFR))?\b/g;

/**
 * A site section a citation may name in parentheses, e.g. `(/methodology/#excluded)`. The
 * WHOLE literal becomes the link rather than the path alone: a resident follows the words, and
 * the citation stays one text node, so the page-baseline capture of that text is unchanged.
 */
const SITE_PATH = /\((\/[a-z0-9-]+\/(?:#[a-z0-9-]+)?)\)/;

/**
 * The `explanation` contract: material a reader wants on request, not on arrival.
 *
 * `sourceLinks` is resolved by the server caller and passed in already serializable. Reading
 * sources here would drag `node:fs` into every client component that renders history, which is
 * the boundary EntityHistoryComparison exists to hold.
 */
export function NoteExplanations({
  notes,
  sourceLinks = {},
}: {
  notes: DataNote[];
  sourceLinks?: Record<string, string>;
}) {
  if (notes.length === 0) return null;
  return (
    <section id="explanations" aria-labelledby="explanations-title" className="mt-6">
      <h2 id="explanations-title" className="sr-only">More about this figure</h2>
      <div className="grid gap-2">
        {notes.map((note) => (
          <details key={note.note_id} data-note-id={note.note_id} className="rounded-md border border-hairline bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">{note.headline}</summary>
            <div className="mt-3 grid gap-3 text-sm leading-relaxed text-ink-secondary">
              {note.text.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              <p className="font-mono text-xs text-ink-faint">
                Source:{" "}
                {note.source_ref.split(SOURCE_CODE).flatMap((literal, index, parts) => {
                  const codes = note.source_ref.match(SOURCE_CODE) ?? [];
                  const code = index < parts.length - 1 ? codes[index] : null;
                  const href = code ? sourceLinks[code] : undefined;
                  const sitePath = SITE_PATH.exec(literal)?.[1];
                  return [
                    sitePath
                      ? <a key={`t${index}`} href={sitePath} className="underline decoration-dotted underline-offset-2 hover:text-accent">{literal}</a>
                      : <span key={`t${index}`}>{literal}</span>,
                    code
                      ? href
                        ? <a key={`c${index}`} href={href} className="underline decoration-dotted underline-offset-2 hover:text-accent">{code}</a>
                        : <span key={`c${index}`}>{code}</span>
                      : null,
                  ];
                })}
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
