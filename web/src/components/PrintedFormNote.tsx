import { noteAnchor } from "@/components/DataNotes";
import type { PrintedForm } from "@/lib/schema";

export const PRINTED_DASH_NOTE_ID = "note.printed-dash";

export function isPrintedDash(printedForm: PrintedForm | null): boolean {
  return printedForm === "-" || printedForm === "--";
}

/**
 * The visible source-form mark attached to every dash-derived canonical value.
 *
 * It is a real link rather than a title/tooltip: it prints, works on touch, is keyboard
 * reachable, and gives a screen reader the full reason for the mark. The target lives in
 * the site footer so this contract also works in client-rendered search results and in any
 * future value surface without each page having to remember its own footnote block.
 */
export function PrintedDashMark({
  printedForm,
}: {
  printedForm: PrintedForm | null;
}) {
  if (!isPrintedDash(printedForm)) return null;
  return (
    <sup
      className="ml-0.5 font-mono text-[10px] font-normal text-ink-faint"
      data-printed-dash-marker="true"
    >
      <a
        href={`#${noteAnchor(PRINTED_DASH_NOTE_ID)}`}
        className="hover:text-accent"
        aria-label="Source-form note: the county printed a dash here, not a numeric zero"
        data-printed-dash-mark="true"
      >
        †
      </a>
    </sup>
  );
}
