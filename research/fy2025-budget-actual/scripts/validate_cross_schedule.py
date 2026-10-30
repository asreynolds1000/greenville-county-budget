"""Assert our grand totals equal the county's basic budget-versus-actual statement.

Why this exists (judge pass, 2026-07-21, anomaly-queue item 4):

The county prints the same year two ways. The basic financial statement groups
expenditures by function and pulls capital outlay out into a single line. The detailed
supplementary schedule, which this dataset is built from, leaves each department's capital
outlay inside that department. So per-department figures differ between the two, by exactly
that department's capital outlay, while the GRAND TOTALS are identical.

A resident who compares our department figures against the county's one-page summary will
find ours larger and may reasonably conclude we are wrong. The methodology page answers
that. This check answers a different question: whether the two presentations actually do
reconcile in every year, or whether some year genuinely disagrees. Nothing else in the
pipeline would notice.

It also gives the original-budget column a top-level anchor. `audited-general-fund-series.csv`
carries no original-budget figure, which is why the fidelity audit had to give every
department total in that column full coverage rather than sampling it. The basic statement
prints an original-budget grand total, so this is the first independent check that column
has ever had at the total level.

Run:  python3 scripts/validate_cross_schedule.py
Exits 0 only when every extracted year reconciles.
"""

import csv
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The FY2018 Total public safety row is stored absent because the county omitted it.
# Its value is derived from the printed children. See source-anomalies.md A1.
DERIVED_TOTALS = {("2018", "Public safety")}


def load_csv(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def money(value):
    s = (value or "").strip()
    if s in ("", "-", "blank", "n/a"):
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").replace("$", "").strip()
    try:
        n = int(s)
    except ValueError:
        return None
    return -n if negative else n


def our_totals():
    """Grand totals from our dataset, per year, per column."""
    exp = load_csv("detailed-expenditure-by-year.csv")
    rev = load_csv("detailed-revenue-by-year.csv")

    # Sum sub-department totals per department so a derived department total can be
    # reconstructed where the county omitted it.
    kids = defaultdict(lambda: defaultdict(int))
    for r in exp:
        if r["subdepartment"] and not r["object"]:
            for c in ("original_budget", "final_budget", "actual"):
                kids[(r["fiscal_year"], r["department"])][c] += money(r[c]) or 0

    expend = defaultdict(lambda: defaultdict(int))
    for r in exp:
        if r["subdepartment"] or r["object"]:
            continue
        key = (r["fiscal_year"], r["department"])
        for c in ("original_budget", "final_budget", "actual"):
            v = money(r[c])
            if v is None and key in DERIVED_TOTALS:
                v = kids[key][c]
            expend[r["fiscal_year"]][c] += v or 0

    revenue = defaultdict(lambda: defaultdict(int))
    for r in rev:
        if r["subline"]:
            continue
        for c in ("original_budget", "final_budget", "actual"):
            revenue[r["fiscal_year"]][c] += money(r[c]) or 0

    return revenue, expend


def basic_statement():
    """Printed grand totals from `basic-statement-totals.csv`, the committed source.

    This deliberately reads the repo file rather than the extraction scratch files. A
    validator whose inputs live in a session temp directory silently stops checking
    anything the moment that directory is cleaned up, and it reports success while doing
    it, which is the most dangerous shape a gate can take.
    """
    out = {}
    for r in load_csv("basic-statement-totals.csv"):
        year = str(r["fiscal_year"])
        out.setdefault(year, {})[r["measure"]] = {
            "original": r["original_budget"],
            "final": r["final_budget"],
            "actual": r["actual"],
        }
    return out


COLS = (("original", "original_budget"), ("final", "final_budget"), ("actual", "actual"))


def main():
    revenue, expend = our_totals()
    stmt = basic_statement()

    if not stmt:
        print("No basic-statement extractions found. Nothing to check.")
        return 1

    failures = []
    checks = 0

    for year in sorted(stmt):
        entry = stmt[year]
        for field, ours_by_year in (("total_revenues", revenue),
                                    ("total_expenditures", expend)):
            printed = entry.get(field) or {}
            for stmt_col, our_col in COLS:
                expected = money(printed.get(stmt_col))
                if expected is None:
                    continue
                checks += 1
                got = ours_by_year[year][our_col]
                if got != expected:
                    failures.append(
                        f"FY{year} {field} {our_col}: statement prints {expected:,}, "
                        f"our detailed schedule sums to {got:,}, "
                        f"difference {got - expected:,}"
                    )

    print(f"{checks} cross-schedule checks across {len(stmt)} years")
    if failures:
        print(f"{len(failures)} FAILURES\n")
        for f in failures:
            print("  " + f)
        print("\nA failure here means the county's two presentations of the same year do "
              "not reconcile, or our sum is wrong. Both need a human before publication.")
        return 1
    print("all years reconcile against the county's basic statement")
    return 0


if __name__ == "__main__":
    sys.exit(main())
