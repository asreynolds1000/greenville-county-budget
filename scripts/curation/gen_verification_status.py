"""Turn the source-fidelity audit's results table into data the site can publish.

Run:  python3 -m scripts.curation.gen_verification_status

## Why this is generated and not written

The methodology page has to state how deeply each year was verified. A site that states its
verification depth PER YEAR is much harder to embarrass than one that implies uniform
certainty — and this dataset genuinely is not uniform. FY2025 has two independent
extractions behind it. The other fourteen years have one extraction plus a stratified blind
re-read of about thirty cells. FY2006-FY2010 have neither, because they are not in the
dataset at all.

Prose would drift from the audit the first time the audit was re-run, and the drift would be
invisible: nobody diffs a sentence against a markdown table. So the numbers come from
`research/fy2025-budget-actual/fidelity-audit.md`, parsed, and the parse is checked against
the totals that document states in its own prose. If the table and the prose disagree, this
refuses to write rather than publishing either.

That cross-check is the point. Parsing a markdown table is brittle; a brittle parser that
silently produces four rows instead of fifteen would put "verified" next to years nobody
verified. The audit's own headline — 423 cells, 415 exact, 8 dash-as-nil, 0 mismatches — is
the independent statement of what the table must add up to.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_AUDIT = _ROOT / "research" / "fy2025-budget-actual" / "fidelity-audit.md"
_OUT = _ROOT / "data" / "production" / "verification_status.csv"

_FIELDS = [
    "fiscal_year", "method", "cells_sampled", "cells_exact",
    "cells_dash_as_nil", "cells_mismatched", "anomalies_reported", "status_note",
]

_ROW = re.compile(
    r"^\|\s*FY(\d{4})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|"
    r"\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$"
)
_HEADLINE = re.compile(
    r"(\d+) cells sampled across (\d+) years, (\d+) exact matches, (\d+) accounted for by a\s*\n?"
    r"documented convention, zero mismatches"
)


def _int_or_none(cell: str) -> int | None:
    return None if cell.strip().lower() in {"n/a", "-", ""} else int(cell.strip())


def main() -> int:
    text = _AUDIT.read_text(encoding="utf-8")

    rows: list[dict] = []
    for line in text.splitlines():
        match = _ROW.match(line)
        if not match:
            continue
        year, sampled, exact, dash, mismatch, anomalies, status = match.groups()
        sampled_n = _int_or_none(sampled)
        rows.append({
            "fiscal_year": year,
            # FY2025 is the one year with two independent extractions; the rest are one
            # extraction plus a blind re-read. Saying so per year is the whole point.
            "method": "dual_independent_extraction" if sampled_n is None else "blind_resample",
            "cells_sampled": "" if sampled_n is None else sampled_n,
            "cells_exact": "" if _int_or_none(exact) is None else _int_or_none(exact),
            "cells_dash_as_nil": "" if _int_or_none(dash) is None else _int_or_none(dash),
            "cells_mismatched": "" if _int_or_none(mismatch) is None else _int_or_none(mismatch),
            "anomalies_reported": "" if _int_or_none(anomalies) is None else _int_or_none(anomalies),
            "status_note": status.strip(),
        })

    if not rows:
        raise SystemExit("parsed no rows from the audit table — the format changed")

    headline = _HEADLINE.search(text.replace("**", ""))
    if not headline:
        raise SystemExit(
            "could not find the audit's headline totals in its prose. That sentence is the "
            "independent check on this parse; without it, refusing to write."
        )
    want_cells, want_years, want_exact, want_dash = (int(g) for g in headline.groups())

    got_cells = sum(int(r["cells_sampled"]) for r in rows if r["cells_sampled"] != "")
    got_exact = sum(int(r["cells_exact"]) for r in rows if r["cells_exact"] != "")
    got_dash = sum(int(r["cells_dash_as_nil"]) for r in rows if r["cells_dash_as_nil"] != "")
    got_years = sum(1 for r in rows if r["cells_sampled"] != "")
    got_mismatch = sum(int(r["cells_mismatched"]) for r in rows if r["cells_mismatched"] != "")

    problems = []
    if got_cells != want_cells:
        problems.append(f"cells sampled: table {got_cells}, prose {want_cells}")
    if got_exact != want_exact:
        problems.append(f"exact matches: table {got_exact}, prose {want_exact}")
    if got_dash != want_dash:
        problems.append(f"dash-as-nil: table {got_dash}, prose {want_dash}")
    if got_years != want_years:
        problems.append(f"years sampled: table {got_years}, prose {want_years}")
    if got_mismatch != 0:
        problems.append(f"mismatches: table {got_mismatch}, prose says zero")
    if problems:
        raise SystemExit(
            "refusing to write: the audit's table and its own prose disagree.\n  "
            + "\n  ".join(problems)
        )

    with _OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} verification rows to {_OUT.relative_to(_ROOT)} "
          f"({got_cells} cells, {got_exact} exact, {got_dash} dash-as-nil, 0 mismatched)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
