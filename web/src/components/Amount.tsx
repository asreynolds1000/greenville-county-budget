import { formatAmount } from "@/lib/format";
import { PrintedDashMark } from "@/components/PrintedFormNote";
import type { PrintedForm } from "@/lib/schema";

/**
 * The only path a dollar value renders through in this app (plan Decision
 * 4.3 / R2). Input is `number | null`, never a pre-formatted string, so the
 * null-vs-zero distinction can't be lost before it gets here.
 *
 * The `data-unpublished="true"` attribute (not the rendered text) is what the
 * postbuild HTML gate (Step 9) keys on. A numeric zero and a dash treated as
 * zero for arithmetic both display as "$0" (the latter with a visible source-
 * form mark), while a null-rendered amount is unpublished. The gate therefore
 * cannot infer publication state by scanning for the string "$0" (plan R2).
 */
export function Amount({
  value,
  printedForm,
}: {
  value: number | null;
  /** Required at every call site: null means calculated or printed numerically. */
  printedForm: PrintedForm | null;
}) {
  if (value === null) {
    return (
      <span data-unpublished="true">{formatAmount(value)}</span>
    );
  }
  return (
    <span data-unpublished="false" data-printed-form={printedForm ?? undefined}>
      {formatAmount(value)}
      <PrintedDashMark printedForm={printedForm} />
    </span>
  );
}
