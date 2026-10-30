import Link from "@/components/AppLink";

import { noteAnchor } from "@/components/DataNotes";
import { PRINTED_DASH_NOTE_ID } from "@/components/PrintedFormNote";
import { getAllDataNotes, getCorrections, getPendingYears } from "@/lib/loaders";
import { REPO_URL } from "@/lib/site";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function PrintedDashFootnote() {
  const note = getAllDataNotes().find((candidate) => candidate.note_id === PRINTED_DASH_NOTE_ID);
  if (!note) {
    throw new Error(`${PRINTED_DASH_NOTE_ID} is required by the printed-form rendering contract`);
  }
  return (
    <p
      id={noteAnchor(note.note_id)}
      className="mt-4 text-xs leading-relaxed text-ink-secondary"
      data-printed-dash-footnote="true"
    >
      <span className="mr-1 font-mono text-ink-faint" aria-hidden="true">†</span>
      <strong className="font-medium text-ink">{note.headline}.</strong>{" "}
      {note.text}
    </p>
  );
}

/**
 * On every page, because the three things it carries have to be reachable from wherever a
 * reader landed — and most readers will land on a deep entity page from a search result,
 * not on the home page.
 *
 * The data version is here rather than only on the corrections page so that a screenshot
 * of any figure carries the version that figure belongs to. It is a hash of the data, not
 * a build timestamp: it changes when a number changes, and not when the site is rebuilt.
 */
export function SiteFooter() {
  const { data_version: dataVersion } = getCorrections();
  const lastDataStatusCheck = getPendingYears().reduce(
    (latest, pending) => pending.status_checked_on > latest ? pending.status_checked_on : latest,
    "",
  );

  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <p className="text-sm leading-relaxed text-ink-secondary">
          An independent, non-advocacy transcription of Greenville County&rsquo;s published
          budget documents and audited financial reports. The county&rsquo;s own documents
          govern; this site transcribes them.
        </p>
        <nav aria-label="Site" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
            County overview
          </Link>
          <Link href="/search/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
            Search
          </Link>
          <Link href="/about/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
            About
          </Link>
          <Link
            href="/methodology/"
            className="underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            Methodology and coverage
          </Link>
          <Link
            href="/corrections/"
            className="underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            Corrections
          </Link>
          <Link
            href="/downloads/"
            className="underline decoration-dotted underline-offset-2 hover:text-accent"
          >
            Download the data
          </Link>
          <a href={REPO_URL} className="underline decoration-dotted underline-offset-2 hover:text-accent">
            Source code and data
          </a>
        </nav>
        <p className="mt-4 font-mono text-xs text-ink-faint">
          Budget status checked {formatDate(lastDataStatusCheck)} · Data version {dataVersion}
        </p>
        <PrintedDashFootnote />
      </div>
    </footer>
  );
}
