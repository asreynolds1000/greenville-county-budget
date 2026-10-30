"""Compare a blind reader's transcription against our dataset for one or more years.

Usage:  python3 scripts/compare_fidelity_sample.py 2016 2011 ...
        python3 scripts/compare_fidelity_sample.py all

Reads <SCRATCH>/fy<YEAR>-sample.json (the coordinates we sent the reader) and
<SCRATCH>/fy<YEAR>-read.json (what it transcribed), then checks each sampled cell
against detailed-expenditure-by-year.csv / detailed-revenue-by-year.csv.

A dash, blank, or "not found" parses to None rather than 0, because absent is not zero.
That is the distinction the FY2018 defect turned on, so the comparator has to honour it
or it will score an absent cell as agreeing with a false zero.

Exit code is the number of years carrying at least one mismatch.
"""

import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = os.environ.get("FIDELITY_WORK_DIR", os.path.join(HERE, "fidelity-reads"))


def load_csv(name):
    with open(os.path.join(HERE, name), newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


EXP = load_csv("detailed-expenditure-by-year.csv")
REV = load_csv("detailed-revenue-by-year.csv")

ABSENT = ("-", "", "blank", "not found", "unreadable", "--", "n/a")


def parse(value):
    s = (value or "").strip()
    if s.lower() in ABSENT:
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").replace("$", "").strip()
    try:
        n = int(s)
    except ValueError:
        return "UNPARSEABLE:" + (value or "")
    return -n if negative else n


def find_row(year, spec):
    level = spec["level"]
    if level == "revenue_subline":
        return next(
            (r for r in REV
             if r["fiscal_year"] == year
             and r["category"] == spec["category"]
             and r["subline"] == spec["subline"]),
            None,
        )
    rows = [r for r in EXP
            if r["fiscal_year"] == year and r["department"] == spec["department"]]
    if level == "department_total":
        return next((r for r in rows if not r["subdepartment"] and not r["object"]), None)
    if level == "subdepartment_total":
        return next((r for r in rows
                     if r["subdepartment"] == spec["subdepartment"] and not r["object"]),
                    None)
    return next((r for r in rows
                 if r["subdepartment"] == spec["subdepartment"]
                 and r["object"] == spec["object"]), None)


def dash_is_nil(year, spec):
    """Is a printed dash legitimately nil here, or is it the FY2018 defect?

    Below the department-total level a dash is always a nil appropriation.
    On a department total it is nil only when the children are nil as well; if the
    children carry real budgets the total cannot be zero and the dash is a source defect.
    """
    if spec["level"] != "department_total":
        return True
    children = [r for r in EXP
                if r["fiscal_year"] == year
                and r["department"] == spec["department"]
                and r["subdepartment"] and not r["object"]]
    total = 0
    for r in children:
        for col in ("original_budget", "final_budget", "actual"):
            v = parse(r[col])
            if isinstance(v, int):
                total += abs(v)
    return total == 0


def compare(year):
    sample_path = os.path.join(SCRATCH, f"fy{year}-sample.json")
    read_path = os.path.join(SCRATCH, f"fy{year}-read.json")
    if not os.path.exists(read_path):
        print(f"FY{year}: no reader output yet")
        return None

    sample = json.load(open(sample_path))
    read = json.load(open(read_path))
    got = {c["id"]: c for c in read.get("cells", [])}

    matches, mismatches, unread, low_conf, convention = 0, [], [], 0, 0

    for spec in sample:
        cell = got.get(spec["id"])
        if not cell:
            unread.append(spec["id"])
            continue
        if cell.get("confidence") in ("medium", "low"):
            low_conf += 1
        row = find_row(year, spec)
        ours = parse(row[spec["column"]]) if row else "ROW-NOT-FOUND"
        theirs = parse(cell.get("printed_value"))
        if ours == theirs:
            matches += 1
        elif ours == 0 and theirs is None and dash_is_nil(year, spec):
            # Printed dash transcribed as 0. A dash means nil under normal accounting
            # presentation, so this is the dataset's convention rather than a
            # discrepancy, and it is applied consistently (45 such rows across 15 years).
            #
            # dash_is_nil() applies the SAME discriminator as validate_detailed.py
            # rather than a blanket level rule: on a total row the tolerance holds only
            # when the children are nil too (the A2 pattern, e.g. Debt service, where no
            # appropriation was made). A total whose children carry real budgets can
            # never be nil, which is the FY2018 defect, and that still hard-fails here.
            convention += 1
        else:
            label = (spec.get("subline") or spec.get("object")
                     or spec.get("subdepartment") or spec.get("department"))
            mismatches.append(
                f"    id={spec['id']:>2} {spec['level']:<20} {str(label)[:30]:<30} "
                f"{spec['column']:<15} ours={ours} reader={theirs} "
                f"(read as {cell.get('printed_label','?')!r} p{cell.get('pdf_page','?')})"
            )

    n = len(sample)
    status = "PASS" if not mismatches and not unread else "REVIEW"
    print(f"FY{year}: {matches}/{n} exact, {convention} dash-as-nil (below total level), "
          f"{len(mismatches)} mismatch, {len(unread)} unread, "
          f"{low_conf} low/med confidence, "
          f"{len(read.get('anomalies', []))} anomalies  [{status}]")
    for m in mismatches:
        print(m)
    if unread:
        print(f"    ids with no reader value: {unread}")
    return len(mismatches)


def main():
    args = sys.argv[1:] or ["all"]
    years = sorted({r["fiscal_year"] for r in EXP}) if args == ["all"] else args
    return sum(1 for y in years if compare(y))


if __name__ == "__main__":
    sys.exit(main())
