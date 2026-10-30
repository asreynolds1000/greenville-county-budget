#!/usr/bin/env python3
"""Task B: Interfund transfers by counterparty fund, General Fund, FY2011-FY2025.

The "composition of interfund transfers" note is a 2-D matrix (source fund x destination
fund) whose ORIENTATION FLIPS partway through the series:
  - FY2011-FY2018: "Transfers Out:" is the ROW axis (source fund), "Transfers In:" is the
    COLUMN axis (destination fund). General Fund is always the first row AND first column.
  - FY2019-FY2025: "Transfer To" is the ROW axis (destination fund), "Transfer From" is the
    COLUMN axis (source fund). General is again always the first row and first column.
Either way: GF's OUT-by-counterparty = the General row/column read as a source; GF's
IN-by-counterparty = the General row/column read as a destination.

Regex-parsing this matrix generically across 14 years of formatting drift (blank cells
with no "-" placeholder, tables that wrap onto a second column-block, headers reprinted
mid-table) risks a bug that mislabels a counterparty while still summing correctly --
which the totals-only reconciliation gate would NOT catch. So this data was extracted by
DIRECT READ of each year's note text (paths + line ranges in SOURCE_LOCATIONS below), and
every row/column total was checked by hand against the source's own printed subtotal
before being entered here. What IS done in code, and is the actual gate: every year's
GF-out total and GF-in total, computed by summing the counterparty amounts below, is
reconciled against audited-general-fund-series.csv (transfers_out / transfers_in actual)
-- the independent, previously-extracted source of truth for this project. See PASS/FAIL
output.
"""
import csv, os

RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE_LOCATIONS = {
    2011: "fy2011.txt:4472-4482 (Transfers In:/Transfers Out: matrix)",
    2012: "fy2012_ocr.txt:3542-3551 (OCR; Transfers In:/Transfers Out: matrix)",
    2013: "fy2013.txt:4586-4607 (Transfers In:/Transfers Out: matrix)",
    2014: "fy2014.txt:4583-4602 (Transfers In:/Transfers Out: matrix)",
    2015: "fy2015.txt:5014-5032 (Transfers In:/Transfers Out: matrix)",
    2016: "fy2016.txt:4924-4944 (Transfers In:/Transfers Out: matrix)",
    2017: "fy2017.txt:4696-4711 (Transfers In:/Transfers Out: matrix)",
    2018: "fy2018.txt:4307-4323 (Transfers In:/Transfers Out: matrix)",
    2019: "fy2019.txt:3508-3528 (Transfer To/Transfer From matrix, Note 7)",
    2020: "fy2020.txt:3678-3696 (Transfer To/Transfer From matrix, Note 7)",
    2021: "fy2021.txt:3682-3700 (Transfer To/Transfer From matrix, Note 7)",
    2022: "fy2022.txt:4109-4128 (Transfer To/Transfer From matrix, Note 8)",
    2023: "fy2023.txt:3960-3979 (Transfer To/Transfer From matrix, Note 8)",
    2024: "fy2024.txt:3804-3823 (Transfer To/Transfer From matrix, Note 8)",
    2025: "fy2025-transfers.csv (existing verified file; Note 8)",
}

# {year: {"out": {counterparty: amount, ...}, "in": {counterparty: amount, ...}}}
TRANSFERS = {
    2011: {
        "out": {"Federal and State Grant Fund": 88962, "Nonmajor Governmental Funds": 5000000},
        "in":  {"Federal and State Grant Fund": 22712, "Nonmajor Governmental Funds": 7248479},
    },
    2012: {
        "out": {"Federal and State Grant Fund": 165462, "Nonmajor Governmental Funds": 202500},
        "in":  {"Federal and State Grant Fund": 1157, "Nonmajor Governmental Funds": 4104512,
                "Enterprise Funds": 400000},
    },
    2013: {
        "out": {"Federal and State Grant Fund": 88379, "Nonmajor Governmental Funds": 283045},
        "in":  {"Nonmajor Governmental Funds": 4134602, "Enterprise Funds": 402517},
    },
    2014: {
        "out": {"Federal and State Grant Fund": 76257, "Parks, Recreation & Tourism": 2500,
                "Nonmajor Governmental Funds": 1189077},
        "in":  {"Nonmajor Governmental Funds": 5565294, "Enterprise Funds": 1000000},
    },
    2015: {
        "out": {"Federal and State Grant Fund": 127799, "Nonmajor Governmental Funds": 1483841},
        "in":  {"Nonmajor Governmental Funds": 6495986},
    },
    2016: {
        "out": {"Federal and State Grant Fund": 156879, "Nonmajor Governmental Funds": 4044728},
        "in":  {"Nonmajor Governmental Funds": 6027906, "Internal Service Funds": 250000},
    },
    2017: {
        "out": {"Federal and State Grant Fund": 120122, "Capital Projects": 2015000,
                "Internal Service Funds": 2100000, "Nonmajor Governmental Funds": 2515192},
        "in":  {"Federal and State Grant Fund": 15332, "Nonmajor Governmental Funds": 6060464},
    },
    2018: {
        "out": {"Federal and State Grant Fund": 132578, "Internal Service Funds": 3897860,
                "Nonmajor Governmental Funds": 2504061},
        "in":  {"Federal and State Grant Fund": 42860, "Nonmajor Governmental Funds": 9100000,
                "Internal Service Funds": 500000},
    },
    2019: {
        "out": {"Nonmajor Governmental Funds": 2984608, "Internal Service Funds": 4826403},
        "in":  {"Nonmajor Governmental Funds": 9462923, "Internal Service Funds": 500000},
    },
    2020: {
        "out": {"Nonmajor Governmental Funds": 3402958},
        "in":  {"Nonmajor Governmental Funds": 12899633, "Internal Service Funds": 2000000},
    },
    2021: {
        "out": {"Capital Projects": 19674743, "Nonmajor Governmental Funds": 3387868},
        "in":  {"Greenville Co. Redevelopment Corporation": 10936139,
                "Nonmajor Governmental Funds": 12040128, "Internal Service Funds": 500000},
    },
    2022: {
        "out": {"Nonmajor Governmental Funds": 6067896, "Internal Service Funds": 10476212},
        "in":  {"COVID Relief Fund": 41245916, "Nonmajor Governmental Funds": 12436218,
                "Internal Service Funds": 2000000},
    },
    2023: {
        "out": {"Capital Projects": 700951, "Nonmajor Governmental Funds": 5899016},
        "in":  {"Revenue Bonds": 30336733, "Nonmajor Governmental Funds": 12710307,
                "Internal Service Funds": 2000000},
    },
    2024: {
        "out": {"Capital Projects": 2404544, "Nonmajor Governmental Funds": 6456845},
        "in":  {"COVID Relief Fund": 2423126, "Nonmajor Governmental Funds": 11874450,
                "Internal Service Funds": 2250000},
    },
    2025: {
        "out": {"Capital Projects Fund": 2344855, "Miscellaneous Other Grants Fund": 76699,
                "Nonmajor Governmental Funds": 7223054},
        "in":  {"Nonmajor Governmental Funds": 13167995, "Internal Service Funds": 2250000},
    },
}

def load_audited():
    out = {}
    with open(f"{RES}/audited-general-fund-series.csv") as f:
        for row in csv.DictReader(f):
            if row["measure"] in ("transfers_in", "transfers_out"):
                out.setdefault(int(row["fiscal_year"]), {})[row["measure"]] = int(row["actual"])
    return out

def main():
    audited = load_audited()
    rows = []
    gate = []
    for year in sorted(TRANSFERS):
        d = TRANSFERS[year]
        src = f"FY{year} ACFR interfund transfers note ({SOURCE_LOCATIONS[year]})"
        out_sum = sum(d["out"].values())
        in_sum = sum(d["in"].values())
        want_out = abs(audited.get(year, {}).get("transfers_out", 0))
        want_in = audited.get(year, {}).get("transfers_in", 0)
        out_ok = out_sum == want_out
        in_ok = in_sum == want_in
        status = "PASS" if (out_ok and in_ok) else "FAIL"
        gate.append((year, status,
            f"out={out_sum:,} (want {want_out:,}) {'OK' if out_ok else 'MISMATCH'}; "
            f"in={in_sum:,} (want {want_in:,}) {'OK' if in_ok else 'MISMATCH'}"))
        if status != "PASS":
            continue  # don't force numbers into the CSV for a failing year
        for cp, amt in d["out"].items():
            rows.append([year, "transfer_out", f"To {cp}", amt, src])
        rows.append([year, "transfer_out", "TOTAL transfers out of General Fund", out_sum,
                     f"FY{year} ACFR interfund transfers note"])
        for cp, amt in d["in"].items():
            rows.append([year, "transfer_in", f"From {cp}", amt, src])
        rows.append([year, "transfer_in", "TOTAL transfers into General Fund", in_sum,
                     f"FY{year} ACFR interfund transfers note"])

    out_path = f"{RES}/transfers-by-year.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fiscal_year", "direction", "general_fund_counterparty", "amount", "source"])
        w.writerows(rows)

    print(f"{'FY':<6}{'GATE':<6}{'detail'}")
    all_pass = True
    for y, status, detail in gate:
        if status != "PASS":
            all_pass = False
        print(f"{y:<6}{status:<6}{detail}")
    print(f"\nAll years PASS: {all_pass}")
    print(f"Wrote {out_path} ({len(rows)} rows)")

if __name__ == "__main__":
    main()
