"""Validate and preview the FY2026 interfund transfer schedule. Research only; nothing ships.

What this answers: which transfers between county funds does the county itself name, and what
does its own published total leave unaccounted for. What it deliberately does NOT answer: what
the county spends on services once transfers are removed. That number is not derivable from
these statements and the difference is not an interval around it — the county budgets a
$2,520,467 increase in Debt Service fund balance in FY2026 alone (p.36), so a receipt need not
become expenditure in the same year. An earlier draft of this work printed two spending-like
totals with the difference between them presented as the width of an uncertainty. They are gone,
and this script will not print one.

Two kinds of row, and the distinction is the point:

  named_pair  both amounts and at least one counterparty come from a county statement. The
              `evidence` column says whose statement: the sender's, the receiver's, or both.
  residual    a SITE DERIVATION. The county published a fund total and named less than all of
              it; this is the difference, with its formula and operands in the row. It is never
              zero-filled and never presented as something the county printed.

    python3 -m scripts.research.transfer_schedule            # validate, print the summary
    python3 -m scripts.research.transfer_schedule --preview  # also write preview.md
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEDULE = ROOT / "research" / "transfer-reconciliation-2026-09" / "transfer_schedule.csv"
PREVIEW = SCHEDULE.parent / "preview.md"

# Every control below is an FY2026 literal transcribed from one book. A row from another year
# or another edition would tie to nothing here, so the schedule is checked for that identity
# first; adding a year means adding that year's controls, not reusing these.
CONTROL_YEAR = "2026"
CONTROL_SOURCE = "FY2026"

# The county's own consolidated fund summary, FY2026 adopted, printed p.36 (PDF p.37). These are
# the control totals every tie-out is measured against; they are transcribed from the source, not
# computed from the schedule, so a schedule that quietly drops a row cannot also move its target.
PAGE_36 = {
    "transfers_in": {
        "fund.general": 21414993,
        "special_revenue": 12047082,
        "fund.debt-service": 25992655,
        "fund.capital-projects": 15450000,
        "fund.enterprise": 10000000,
    },
    "transfers_out": {
        "fund.general": 8502046,
        "special_revenue": 57559768,
        "fund.enterprise": 2812000,
        "isf": 2500000,
    },
    "total_in": 84904730,
    "total_out": 68873814,
}

# Each selected Special Revenue fund's own page, FY2026 adopted transfers out. The printed page
# numbers are read from each page's own printed footer, not guessed from the PDF index: four of
# the five I first wrote here from memory were wrong, by between two and eight pages.
SR_SENDER_PAGES = {
    "fund.sr.state-accommodations-tax": (75000, 134),
    "fund.sr.hospitality-tax": (12464744, 139),
    "fund.sr.infrastructure-bank": (36888650, 140),
    "fund.sr.parks-recreation-tourism": (5035024, 145),
    "fund.sr.road-program": (3096350, 150),
}

# The published FY2026 total covers the General Fund, the selected Special Revenue funds, Debt
# Service and Enterprise (p.8). Capital Projects and Internal Service are reported separately.
# The perimeter flags on each row are checked against this rather than trusted.
INSIDE_PERIMETER = {"fund.general", "fund.debt-service", "fund.enterprise"}
OUTSIDE_PERIMETER = {"fund.capital-projects"}
OUTSIDE_PREFIXES = ("isf.",)
SR_PREFIX = "fund.sr."

# Within-book conflicts the source prints, transcribed as controls so a schedule that quietly
# picks one printed amount and drops the other fails. (sender, receiver) -> (amount, amount_alt,
# alt printed page). Both must stay on the row with a discrepancy note.
CONFLICTS = {
    ("fund.sr.hospitality-tax", "fund.general"): (2162116, 2162115, "47"),
    ("fund.sr.infrastructure-bank", "fund.sr.road-program"): (5662298, 5662209, "47"),
}

_DERIVATION = re.compile(
    r"^(?P<published>\d+) published (?:in|out) minus (?P<named>\d+) named = (?P<result>\d+); "
    r"operands: (?P<operands>\d+(?:\+\d+)*)$"
)
REQUIRED_COLUMNS = [
    "fiscal_year", "status_class", "source_code", "printed_page", "pdf_page",
    "sending_fund_id", "sending_fund_label", "receiving_fund_id", "receiving_fund_label",
    "amount", "amount_alt", "alt_printed_page", "sender_in_perimeter", "receiver_in_perimeter",
    "financing_type", "evidence", "row_kind", "derivation", "discrepancy_note",
]
ROW_KINDS = {"named_pair", "residual"}
EVIDENCE = {"sender_statement", "receiver_statement", "both", "site_derivation"}
FINANCING = {"interfund_transfer", "grant_match", "bond_labelled_transfer", "unknown"}
PERIMETER_FLAGS = {"yes", "no", "unknown"}

FORBIDDEN = ("103,140,275", "56,954,730", "417,779,025", "427,006,766", "420,279,025",
             "93.6", "44.0%", "215.8", "159,914")


class Failure(Exception):
    pass


def load(path: Path = SCHEDULE) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != REQUIRED_COLUMNS:
            raise Failure(f"column set changed: {reader.fieldnames}")
        rows = list(reader)
    if not rows:
        raise Failure("the schedule is empty; every check below would pass vacuously")
    return rows


def _int(row: dict, field: str) -> int:
    try:
        return int(row[field])
    except (TypeError, ValueError):
        raise Failure(f"{field}={row[field]!r} is not an integer in row {row['sending_fund_label']}"
                      f" -> {row['receiving_fund_label']}")


def check_vocabulary(rows: list[dict]) -> None:
    for row in rows:
        where = f"{row['sending_fund_label'] or '?'} -> {row['receiving_fund_label'] or '?'}"
        if row["row_kind"] not in ROW_KINDS:
            raise Failure(f"{where}: row_kind {row['row_kind']!r}")
        if row["evidence"] not in EVIDENCE:
            raise Failure(f"{where}: evidence {row['evidence']!r}")
        if row["financing_type"] not in FINANCING:
            raise Failure(f"{where}: financing_type {row['financing_type']!r}")
        for flag in ("sender_in_perimeter", "receiver_in_perimeter"):
            if row[flag] not in PERIMETER_FLAGS:
                raise Failure(f"{where}: {flag} {row[flag]!r}")
        if not row["printed_page"] or not row["pdf_page"]:
            raise Failure(f"{where}: every row needs a printed page AND a PDF page; printed page "
                          "numbers cannot be passed to a PDF reader as indices")
        if _int(row, "amount") < 0:
            raise Failure(f"{where}: amounts are positive magnitudes; direction is carried by the "
                          "sender and receiver columns, never by a sign")
        # Zero is left to the residual gate below, which has the message that actually helps:
        # a zero residual is not a typo, it is a schedule made to tie by pretending nothing is
        # missing, and it deserves to be named as that rather than as a bad number.


def check_identity(rows: list[dict]) -> None:
    """Every row must come from the year and book the control totals were transcribed from."""
    for row in rows:
        where = f"{row['sending_fund_label'] or '?'} -> {row['receiving_fund_label'] or '?'}"
        if row["fiscal_year"] != CONTROL_YEAR:
            raise Failure(f"{where}: fiscal year {row['fiscal_year']!r} is not {CONTROL_YEAR}; the "
                          "control totals are FY2026 literals and cannot validate another year")
        if row["source_code"] != CONTROL_SOURCE:
            raise Failure(f"{where}: source document {row['source_code']!r} is not {CONTROL_SOURCE}; "
                          "every control here was transcribed from that one book")


def _expected_perimeter(fund_id: str) -> str | None:
    if not fund_id:
        return None
    if fund_id in INSIDE_PERIMETER or fund_id.startswith(SR_PREFIX):
        return "yes"
    if fund_id in OUTSIDE_PERIMETER or fund_id.startswith(OUTSIDE_PREFIXES):
        return "no"
    return None


def check_perimeter(rows: list[dict]) -> None:
    """The perimeter flags are checked against the declared perimeter, never trusted.

    A flipped flag silently moves a pair in or out of the matched total without changing any
    sum the tie-outs see.
    """
    for row in rows:
        where = f"{row['sending_fund_label'] or '?'} -> {row['receiving_fund_label'] or '?'}"
        for side, flag in (("sending_fund_id", "sender_in_perimeter"),
                           ("receiving_fund_id", "receiver_in_perimeter")):
            expected = _expected_perimeter(row[side])
            if expected is None:
                if row[side] and row[flag] != "unknown":
                    raise Failure(f"{where}: {row[side]} is not a fund this validator can place, so "
                                  f"{flag} must be 'unknown', not {row[flag]!r}")
                continue
            if row[flag] != expected:
                raise Failure(f"{where}: {flag}={row[flag]!r} contradicts the declared perimeter "
                              f"({row[side]} is {'inside' if expected == 'yes' else 'outside'} the published total)")


def check_derivations(rows: list[dict]) -> None:
    """A residual's formula is parsed and recomputed, never printed on trust."""
    for row in rows:
        if row["row_kind"] != "residual":
            continue
        match = _DERIVATION.match(row["derivation"].strip())
        if not match:
            raise Failure(f"residual derivation {row['derivation'][:60]!r} does not have the form "
                          "'<published> published in|out minus <named> named = <result>; operands: a+b+c'")
        published, named, result = (int(match.group(name)) for name in ("published", "named", "result"))
        operands = [int(value) for value in match.group("operands").split("+")]
        if published - named != result:
            raise Failure(f"residual derivation does not compute: {published:,} - {named:,} != {result:,}")
        if sum(operands) != named:
            raise Failure(f"residual derivation operands sum to {sum(operands):,}, not the named {named:,}")
        if result != _int(row, "amount"):
            raise Failure(f"residual derivation gives {result:,} but the row's amount is {row['amount']}")


def check_conflicts(rows: list[dict]) -> None:
    """Both amounts of every printed conflict stay on their row, and no conflict is invented."""
    by_pair = {(row["sending_fund_id"], row["receiving_fund_id"]): row for row in rows
               if row["row_kind"] == "named_pair"}
    for pair, (amount, alt, alt_page) in CONFLICTS.items():
        row = by_pair.get(pair)
        if row is None:
            raise Failure(f"conflict row {pair} is missing from the schedule")
        if (_int(row, "amount"), row["amount_alt"], row["alt_printed_page"]) != (amount, str(alt), alt_page):
            raise Failure(f"source conflict on {pair[0]} -> {pair[1]} is not preserved: expected "
                          f"{amount:,} / {alt:,} (p.{alt_page}), found {row['amount']} / "
                          f"{row['amount_alt'] or 'none'} (p.{row['alt_printed_page'] or '?'})")
        if not row["discrepancy_note"].strip():
            raise Failure(f"source conflict on {pair[0]} -> {pair[1]} has no discrepancy note")
    for row in rows:
        if row["amount_alt"] and (row["sending_fund_id"], row["receiving_fund_id"]) not in CONFLICTS:
            raise Failure(f"undeclared conflict on {row['sending_fund_label']} -> "
                          f"{row['receiving_fund_label']}: amount_alt {row['amount_alt']} has no control")


def check_page36_totals() -> list[str]:
    """Transcription check on the controls themselves, not a schedule test.

    p.36's printed grand totals must equal the sum of its printed fund lines. Internal Service
    is printed outside the published total, so transfers out excludes it.
    """
    total_in = sum(PAGE_36["transfers_in"].values())
    if total_in != PAGE_36["total_in"]:
        raise Failure(f"p.36 transfers-in lines sum to {total_in:,}, not the printed {PAGE_36['total_in']:,}")
    total_out = sum(value for key, value in PAGE_36["transfers_out"].items() if key != "isf")
    if total_out != PAGE_36["total_out"]:
        raise Failure(f"p.36 transfers-out lines sum to {total_out:,}, not the printed {PAGE_36['total_out']:,}")
    return [f"p.36 controls: transfers in {total_in:,} and transfers out {total_out:,} match their printed totals (transcription check)"]


def check_status(rows: list[dict]) -> None:
    statuses = {row["status_class"] for row in rows}
    if statuses != {"adopted"}:
        raise Failure(f"status mixing: this schedule is one budget basis, found {sorted(statuses)}")


def check_residuals(rows: list[dict]) -> None:
    for row in rows:
        residual = row["row_kind"] == "residual"
        if residual and row["evidence"] != "site_derivation":
            raise Failure(f"residual row {row['derivation'][:40]!r} must be evidence=site_derivation")
        if residual and not row["derivation"]:
            raise Failure("a residual with no derivation is an invented number")
        if residual and _int(row, "amount") == 0:
            # An uncomputable residual is not a row with an empty amount; it is an `unknown`
            # named_pair row (see the Enterprise outflow). Every residual row carries a number.
            raise Failure("residual amount must be positive, never zero: a zero residual "
                          "is how a schedule is made to tie by pretending nothing is missing")
        if not residual and row["evidence"] == "site_derivation":
            raise Failure("a named pair cannot be evidenced by this site's own arithmetic")
        if not residual and row["derivation"]:
            raise Failure("only residual rows carry a derivation")
        if not residual and _int(row, "amount") == 0:
            raise Failure(f"named pair {row['sending_fund_label']} -> {row['receiving_fund_label']} "
                          "has a zero amount; a transfer the county printed as nothing is not a "
                          "transfer, and a missing amount is a different fact from a zero one")


def check_unique(rows: list[dict]) -> None:
    seen = set()
    for row in rows:
        key = (row["fiscal_year"], row["status_class"], row["sending_fund_id"],
               row["receiving_fund_id"], row["amount"], row["row_kind"])
        if key in seen:
            raise Failure(f"duplicate row: {key}")
        seen.add(key)


def _group(fund_id: str) -> str:
    if fund_id.startswith(SR_PREFIX):
        return "special_revenue"
    return fund_id


def check_receipts(rows: list[dict]) -> list[str]:
    """Named receipts plus any residual must equal the published receipt total, per fund group."""
    notes = []
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        target = row["receiving_fund_id"]
        if not target:
            continue
        totals[_group(target)] += _int(row, "amount")
    for group, published in PAGE_36["transfers_in"].items():
        found = totals.get(group, 0)
        if found != published:
            raise Failure(f"receipts into {group} do not tie to p.36: schedule {found:,} vs "
                          f"published {published:,} (difference {published - found:,})")
        notes.append(f"receipts into {group}: {found:,} ties to p.36")
    return notes


def check_sender_pages(rows: list[dict]) -> list[str]:
    """Each Special Revenue sender's own fund page must account for its whole outflow."""
    notes = []
    out: dict[str, int] = defaultdict(int)
    for row in rows:
        if row["sending_fund_id"]:
            out[row["sending_fund_id"]] += _int(row, "amount")
    for fund_id, (published, page) in SR_SENDER_PAGES.items():
        found = out.get(fund_id, 0)
        if found != published:
            raise Failure(f"{fund_id} outflows do not tie to its own p.{page}: schedule "
                          f"{found:,} vs published {published:,}")
        notes.append(f"{fund_id} outflows: {found:,} ties to p.{page}")
    total_sr = sum(published for published, _ in SR_SENDER_PAGES.values())
    if total_sr != PAGE_36["transfers_out"]["special_revenue"]:
        raise Failure("the five Special Revenue sender pages do not sum to p.36's Special Revenue "
                      f"transfers out: {total_sr:,} vs {PAGE_36['transfers_out']['special_revenue']:,}")
    notes.append(f"the five sender pages sum to {total_sr:,}, p.36's Special Revenue transfers out")
    gf = sum(_int(row, "amount") for row in rows if row["sending_fund_id"] == "fund.general")
    if gf != PAGE_36["transfers_out"]["fund.general"]:
        raise Failure(f"General Fund outflows {gf:,} do not tie to p.36's {PAGE_36['transfers_out']['fund.general']:,}")
    notes.append(f"General Fund outflows: {gf:,} ties to p.36")
    # The two senders the first version declared controls for and never checked: deleting the
    # $2,812,000 Enterprise outflow passed every tie-out.
    enterprise = out.get("fund.enterprise", 0)
    if enterprise != PAGE_36["transfers_out"]["fund.enterprise"]:
        raise Failure(f"fund.enterprise outflows {enterprise:,} do not tie to p.36's "
                      f"{PAGE_36['transfers_out']['fund.enterprise']:,}")
    notes.append(f"fund.enterprise outflows: {enterprise:,} ties to p.36")
    isf = sum(total for fund_id, total in out.items() if fund_id.startswith("isf."))
    if isf != PAGE_36["transfers_out"]["isf"]:
        raise Failure(f"Internal Service outflows {isf:,} do not tie to p.36's {PAGE_36['transfers_out']['isf']:,}")
    notes.append(f"Internal Service outflows: {isf:,} ties to p.36 (printed outside the total)")
    return notes


def matched_pairs(rows: list[dict]) -> list[dict]:
    """County-named pairs where both counterparties sit inside the published total.

    "Matched" here means a county statement names both funds, not that two independent ledger
    entries were reconciled to each other. Debt Service never itemises its receipts by sender, so
    for five of these the evidence is the sender's statement alone.
    """
    return [row for row in rows
            if row["row_kind"] == "named_pair"
            and row["financing_type"] == "interfund_transfer"
            and row["sender_in_perimeter"] == "yes"
            and row["receiver_in_perimeter"] == "yes"]


def summarise(rows: list[dict]) -> dict:
    matched = matched_pairs(rows)
    residuals = [row for row in rows if row["row_kind"] == "residual"]
    outside = [row for row in rows if row["row_kind"] == "named_pair"
               and row["sender_in_perimeter"] == "no" and row["receiver_in_perimeter"] == "yes"]
    relabelled = [row for row in rows if row["financing_type"] == "bond_labelled_transfer"]
    unknown_dest = [row for row in rows if row["row_kind"] == "named_pair"
                    and not row["receiving_fund_id"] and row["financing_type"] != "bond_labelled_transfer"]
    conflicts = [row for row in rows if row["amount_alt"]]
    return {
        "matched": matched,
        "matched_total": sum(_int(row, "amount") for row in matched),
        "residuals": residuals,
        "outside": outside,
        "relabelled": relabelled,
        "unknown_dest": unknown_dest,
        "conflicts": conflicts,
    }


def check_no_forbidden_output(text: str) -> None:
    hits = [needle for needle in FORBIDDEN if needle in text]
    if hits:
        raise Failure(f"retracted or removed figures in the output: {hits}")


def write_preview(rows: list[dict], summary: dict) -> str:
    lines = ["# FY2026 interfund transfers the county names", "",
             "Assembled by this site from entries the county published. Source pages are on every",
             "row. Rows marked **site derivation** are this site's arithmetic, not county-printed.",
             "", "## Pairs the county names, both funds inside the published total", "",
             "| Sender | Receiver | Amount | Evidence | Pages |", "|---|---|---:|---|---|"]
    for row in summary["matched"]:
        lines.append(f"| {row['sending_fund_label']} | {row['receiving_fund_label']} | "
                     f"${_int(row, 'amount'):,} | {row['evidence'].replace('_', ' ')} | "
                     f"p.{row['printed_page']} (PDF {row['pdf_page']}) |")
    lines += ["", f"**Sum of these {len(summary['matched'])} pairs: ${summary['matched_total']:,}.** "
              "Calculated here by adding the rows above. It is not a county-published total, and it "
              "is not the amount by which the published budget total double-counts: it is what the "
              "county names.", "",
              "## What the county's totals leave unnamed (site derivations)", "",
              "| Fund | Direction | Residual | How it was derived |", "|---|---|---:|---|"]
    for row in summary["residuals"]:
        label = row["receiving_fund_label"] or row["sending_fund_label"]
        direction = "receipts" if row["receiving_fund_label"] else "outflows"
        # The derivation string is printed verbatim rather than parsed back into fields. Taking a
        # formula apart to re-format it is one regex away from printing a number that is not the
        # one the row records, which is exactly the failure this whole file exists to avoid.
        lines.append(f"| {label} | {direction} | ${_int(row, 'amount'):,} | {row['derivation']} |")
    lines += ["", "## Named receipts from outside the published total", ""]
    for row in summary["outside"]:
        lines.append(f"- ${_int(row, 'amount'):,} from {row['sending_fund_label']} into "
                     f"{row['receiving_fund_label']} (p.{row['printed_page']}). Subtracting every "
                     "transfer receipt would remove this, and it is not a second entry inside the total.")
    lines += ["", "## Lines labelled as transfers that the narrative calls something else", ""]
    for row in summary["relabelled"]:
        lines.append(f"- ${_int(row, 'amount'):,}: {row['discrepancy_note']}")
    lines += ["", "## Named on one side only", ""]
    for row in summary["unknown_dest"]:
        side = row["sending_fund_label"] or row["receiving_fund_label"]
        lines.append(f"- ${_int(row, 'amount'):,} from {side}: {row['discrepancy_note']}")
    lines += ["", "## Where the county's own book disagrees with itself", ""]
    for row in summary["conflicts"]:
        lines.append(f"- {row['sending_fund_label']} to {row['receiving_fund_label']}: "
                     f"${_int(row, 'amount'):,} / ${int(row['amount_alt']):,}. {row['discrepancy_note']}")
    lines += ["", "## What this does not establish", "",
              "It does not establish county spending with transfers removed, and the residuals are",
              "not an interval around such a figure. Debt Service alone budgets a $2,520,467",
              "increase in fund balance (p.36), so a receipt need not become expenditure in the",
              "same year. Publishing a subtraction here would be a number the county did not",
              "publish, about a quantity these statements do not measure.", ""]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true", help="write preview.md beside the schedule")
    args = parser.parse_args(argv)
    try:
        rows = load()
        check_vocabulary(rows)
        check_identity(rows)
        check_status(rows)
        check_residuals(rows)
        check_unique(rows)
        check_perimeter(rows)
        check_derivations(rows)
        check_conflicts(rows)
        notes = check_page36_totals() + check_receipts(rows) + check_sender_pages(rows)
        summary = summarise(rows)
        preview = write_preview(rows, summary)
        check_no_forbidden_output(preview)
    except Failure as failure:
        print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    for note in notes:
        print(f"  ok  {note}")
    print(f"\n{len(rows)} rows; {len(summary['matched'])} named pairs inside the published total, "
          f"summing to ${summary['matched_total']:,} (calculated here).")
    print(f"{len(summary['residuals'])} residual rows, all labelled as site derivations.")
    if args.preview:
        PREVIEW.write_text(preview + "\n", encoding="utf-8")
        print(f"preview -> {PREVIEW.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
