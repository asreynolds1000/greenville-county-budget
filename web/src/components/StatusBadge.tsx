/**
 * Status badges render from data, never a hardcoded string (plan Decision
 * 4.3) — callers resolve the label from a series point's status_class
 * ("adopted" -> "Adopted") and pass it in. Mono, uppercase, tracked wide: a
 * small stamped-ledger mark that echoes the Provenance line it usually sits
 * beside.
 */
export function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-hairline bg-surface px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide text-ink-secondary uppercase">
      {label}
    </span>
  );
}
