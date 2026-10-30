"""Two-column, every-year, every-level reconciliation for the detailed schedule.

Written 2026-07-21 after a defect (FY2018 Total public safety) survived two verification
passes that reconciled only the actual column and only the sub-department level.

The rule those passes lacked, and the reason this file exists:

    A total row may not be zero or absent while its printed children sum non-zero.

That is what distinguishes a county typesetting omission from a genuine nil appropriation.
Registered omissions live in DERIVED_TOTALS below and are documented in source-anomalies.md
with their PDF evidence; an unregistered one is a failure, not a warning.

Run:  python3 scripts/validate_detailed.py
Exits 0 only when every check passes for every year and every column.
"""

import csv
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Total rows the county did not print, where the value is derived from printed children.
# Every entry must have a matching section in source-anomalies.md.
DERIVED_TOTALS = {
    ("2018", "Public safety"): "source-anomalies.md A1",
}

COLS = ("original_budget", "final_budget", "actual")
# audited-general-fund-series.csv carries no original-budget column, so series-level
# checks run on final budget and actual only. Original budget is reachable only through
# the children, which is a known limit recorded in the fidelity-audit scope.
SERIES_COLS = ("final_budget", "actual")


def load(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def num(value):
    """Return (amount, present). An empty cell is absent, which is not zero."""
    raw = (value or "").strip()
    if raw in ("", "-"):
        return 0, False
    return int(raw), True


class Report:
    def __init__(self):
        self.failures = []
        self.checks = 0

    def check(self, ok, message):
        self.checks += 1
        if not ok:
            self.failures.append(message)

    def money(self, label, expected, actual_value):
        self.check(
            expected == actual_value,
            f"{label}: expected {expected:,}, got {actual_value:,}, "
            f"difference {actual_value - expected:,}",
        )


def validate_expenditure(rep):
    rows = load("detailed-expenditure-by-year.csv")

    objects = defaultdict(lambda: defaultdict(int))
    subtotals = {}
    depttotals = {}

    for r in rows:
        year, dept = r["fiscal_year"], r["department"]
        sub, obj = r["subdepartment"], r["object"]
        if sub and obj:
            for c in COLS:
                objects[(year, dept, sub)][c] += num(r[c])[0]
        elif sub:
            subtotals[(year, dept, sub)] = r
        else:
            depttotals[(year, dept)] = r

    # Level 1: object rows sum to their sub-department total.
    for key, row in subtotals.items():
        year, dept, sub = key
        for c in COLS:
            got, _ = num(row[c])
            rep.money(f"FY{year} {dept} / {sub} {c}", objects[key][c], got)

    # Level 2: sub-department totals sum to their department total, plus the rule.
    kids = defaultdict(lambda: defaultdict(int))
    for (year, dept, sub), row in subtotals.items():
        for c in COLS:
            kids[(year, dept)][c] += num(row[c])[0]

    for key, row in depttotals.items():
        year, dept = key
        child_sum = kids.get(key, {})
        has_children = any(child_sum.get(c, 0) for c in COLS)
        for c in COLS:
            got, present = num(row[c])
            expected = child_sum.get(c, 0)
            if not has_children:
                continue
            if not present or got == 0:
                # The rule. Registered omissions derive; unregistered ones fail.
                if key in DERIVED_TOTALS:
                    rep.check(
                        expected != 0,
                        f"FY{year} {dept} {c}: registered as derived but children sum to 0",
                    )
                    # A registered omission must be stored ABSENT, never as 0.
                    # Accepting either was a real gap: on 2026-07-21 a git checkout
                    # silently reverted the FY2018 correction, this validator passed
                    # anyway because 0 was tolerated here, and the commit shipped a
                    # message claiming a fix the tree did not contain. Only the blind
                    # fidelity read caught it. A false zero is the exact thing the
                    # correction exists to prevent, so it fails here now.
                    rep.check(
                        not present,
                        f"FY{year} {dept} {c}: registered as a derived total, so the "
                        f"cell must be empty (absent), but it holds 0. A zero here "
                        f"propagates a fabricated variance downstream.",
                    )
                else:
                    rep.check(
                        False,
                        f"FY{year} {dept} {c}: total is {'absent' if not present else '0'} "
                        f"while children sum to {expected:,}. Either the source omitted a "
                        f"computed total (register it in DERIVED_TOTALS and "
                        f"source-anomalies.md) or the extraction is wrong.",
                    )
            else:
                rep.money(f"FY{year} {dept} {c}", expected, got)

    # Level 3: department totals sum to the series total expenditure.
    series = {}
    for r in load("audited-general-fund-series.csv"):
        series[(r["fiscal_year"], r["measure"])] = r

    by_year = defaultdict(lambda: defaultdict(int))
    for (year, dept), row in depttotals.items():
        for c in COLS:
            got, present = num(row[c])
            if (not present or got == 0) and (year, dept) in DERIVED_TOTALS:
                got = kids[(year, dept)][c]
            by_year[year][c] += got

    for year in sorted(by_year):
        rec = series.get((year, "total_expenditures"))
        if not rec:
            continue
        for c in SERIES_COLS:
            expected, present = num(rec[c])
            if present:
                rep.money(f"FY{year} departments -> total expenditures ({c})",
                          expected, by_year[year][c])


def validate_revenue(rep):
    rows = load("detailed-revenue-by-year.csv")

    sublines = defaultdict(lambda: defaultdict(int))
    cattotals = {}
    for r in rows:
        year, cat, sub = r["fiscal_year"], r["category"], r["subline"]
        if sub:
            for c in COLS:
                sublines[(year, cat)][c] += num(r[c])[0]
        else:
            cattotals[(year, cat)] = r

    for key, row in cattotals.items():
        year, cat = key
        if not any(sublines[key].get(c, 0) for c in COLS):
            continue
        for c in COLS:
            got, _ = num(row[c])
            rep.money(f"FY{year} revenue {cat} {c}", sublines[key][c], got)

    series = {}
    for r in load("audited-general-fund-series.csv"):
        series[(r["fiscal_year"], r["measure"])] = r

    by_year = defaultdict(lambda: defaultdict(int))
    for (year, cat), row in cattotals.items():
        for c in COLS:
            by_year[year][c] += num(row[c])[0]

    for year in sorted(by_year):
        rec = series.get((year, "total_revenues"))
        if not rec:
            continue
        for c in SERIES_COLS:
            expected, present = num(rec[c])
            if present:
                rep.money(f"FY{year} categories -> total revenues ({c})",
                          expected, by_year[year][c])


def main():
    rep = Report()
    validate_expenditure(rep)
    validate_revenue(rep)

    print(f"{rep.checks} checks run")
    if rep.failures:
        print(f"{len(rep.failures)} FAILURES\n")
        for f in rep.failures:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
