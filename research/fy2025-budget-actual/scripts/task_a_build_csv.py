#!/usr/bin/env python3
"""Task A final assembly: run the FY2011/FY2013-FY2024 extractor + the FY2012 OCR extractor,
reconcile every year against audited-general-fund-series.csv (the GATE), fold in the existing
FY2025 file, and emit fund-balance-classifications-by-year.csv (FY2011-FY2025)."""
import csv, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from task_a_fund_balance import extract_year, extract_2012_ocr, YEARS, TEXT

RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

AVAIL = {
    "Nonspendable": "not_available",
    "Restricted": "restricted",
    "Committed": "committed",
    "Assigned": "assigned",
    "Unassigned": "available",
}
BUCKET_ORDER = ["Nonspendable", "Restricted", "Committed", "Assigned", "Unassigned"]

def load_audited_ending():
    out = {}
    with open(f"{RES}/audited-general-fund-series.csv") as f:
        for row in csv.DictReader(f):
            if row["measure"] == "fund_balance_ending":
                out[int(row["fiscal_year"])] = int(row["actual"])
    return out

def build_rows_for_year(year, rows, source_label):
    """rows: list of (bucket, label, amount). Returns output CSV rows in the FY2025 shape:
    one row per nonzero item per bucket; a single '(none for General Fund)' row (amount 0)
    if a bucket has no nonzero items."""
    by_bucket = {b: [] for b in BUCKET_ORDER}
    for b, label, amt in rows:
        by_bucket.setdefault(b, []).append((label, amt))

    out = []
    for b in BUCKET_ORDER:
        items = by_bucket.get(b, [])
        nonzero = [(l, a) for l, a in items if a != 0]
        if nonzero:
            for l, a in nonzero:
                out.append([year, b, l, a, AVAIL[b], source_label])
        else:
            out.append([year, b, "(none for General Fund)", 0, AVAIL[b], source_label])
    return out

def main():
    audited = load_audited_ending()
    all_rows = []
    gate_results = []

    # FY2011, FY2013-FY2024
    for y in YEARS:
        r = extract_year(y)
        src = f"FY{y} ACFR balance sheet, General Fund column"
        if r.get("error"):
            gate_results.append((y, "FAIL", f"extraction error: {r['error']}"))
            continue
        row_sum = sum(v for _, _, v in r["rows"])
        total_line = r["total_check"]
        audited_end = audited.get(y)
        internal_ok = (total_line is not None) and (row_sum == total_line)
        external_ok = (audited_end is not None) and (row_sum == audited_end)
        if internal_ok and external_ok:
            gate_results.append((y, "PASS", f"sum={row_sum:,} == total_line == audited_ending"))
            all_rows.extend(build_rows_for_year(y, r["rows"], src))
            all_rows.append([y, "TOTAL", "Total fund balance", row_sum, "", src])
        else:
            gate_results.append((y, "FAIL",
                f"sum={row_sum:,} total_line={total_line} audited_ending={audited_end}"))

    # FY2012 (OCR)
    r12 = extract_2012_ocr(f"{TEXT}/fy2012_ocr.txt")
    src12 = "FY2012 ACFR balance sheet, General Fund column (OCR text -- scanned book, no text layer)"
    if r12.get("error"):
        gate_results.append((2012, "FAIL", f"extraction error: {r12['error']}"))
    else:
        row_sum = sum(v for _, _, v in r12["rows"])
        total_line = r12["total_check"]
        audited_end = audited.get(2012)
        internal_ok = (total_line is not None) and (row_sum == total_line)
        external_ok = (audited_end is not None) and (row_sum == audited_end)
        if internal_ok and external_ok:
            gate_results.append((2012, "PASS", f"sum={row_sum:,} == total_line == audited_ending (OCR)"))
            all_rows.extend(build_rows_for_year(2012, r12["rows"], src12))
            all_rows.append([2012, "TOTAL", "Total fund balance", row_sum, "", src12])
        else:
            gate_results.append((2012, "FAIL",
                f"sum={row_sum:,} total_line={total_line} audited_ending={audited_end} (OCR)"))

    # FY2025: copy from the existing, already-verified file
    with open(f"{RES}/fy2025-fund-balance-classifications.csv") as f:
        rd = csv.reader(f)
        next(rd)  # header
        fy25_rows = list(rd)
    fy25_sum = sum(int(r[3]) for r in fy25_rows if r[1] != "TOTAL")
    fy25_total = [int(r[3]) for r in fy25_rows if r[1] == "TOTAL"][0]
    fy25_audited = audited.get(2025)
    if fy25_sum == fy25_total == fy25_audited:
        gate_results.append((2025, "PASS", f"sum={fy25_sum:,} (copied from existing verified file)"))
        all_rows.extend([[int(r[0]), r[1], r[2], int(r[3]), r[4], r[5]] for r in fy25_rows])
    else:
        gate_results.append((2025, "FAIL", f"sum={fy25_sum:,} total={fy25_total} audited={fy25_audited}"))

    # sort by year, then bucket order, then TOTAL last
    bucket_rank = {b: i for i, b in enumerate(BUCKET_ORDER)}
    bucket_rank["TOTAL"] = len(BUCKET_ORDER)
    all_rows.sort(key=lambda r: (r[0], bucket_rank.get(r[1], 99)))

    out_path = f"{RES}/fund-balance-classifications-by-year.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fiscal_year", "classification", "detail", "amount", "availability", "source"])
        w.writerows(all_rows)

    print(f"{'FY':<6}{'GATE':<6}{'detail'}")
    all_pass = True
    for y, status, detail in sorted(gate_results):
        if status != "PASS":
            all_pass = False
        print(f"{y:<6}{status:<6}{detail}")
    print(f"\nAll years PASS: {all_pass}")
    print(f"Wrote {out_path} ({len(all_rows)} rows)")

if __name__ == "__main__":
    main()
