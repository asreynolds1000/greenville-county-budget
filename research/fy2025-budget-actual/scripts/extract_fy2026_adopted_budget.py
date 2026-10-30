#!/usr/bin/env python3
"""
Extract Greenville County's ADOPTED FY2026 General Fund budget from the budget book
(BudgetCombined.pdf) and emit fy2026-adopted-budget.csv.

Source: data/raw/gc-fy2026/BudgetCombined.pdf
Tables cited (verified against pdftotext -layout output):
  - "GENERAL FUND REVENUE SUMMARY"        printed p.56 / pdf p.57
  - "GENERAL FUND APPROPRIATIONS SUMMARY" printed p.57 / pdf p.58
  - "FY2024-FY2026 SUMMARY OF ESTIMATED FINANCIAL SOURCES AND USES" printed p.37 / pdf p.38
    (higher-level cross-check table; contains a label-transposition bug for two
    department rows -- see notes on the Public works / Planning and development rows)

All dollar figures below were transcribed from the FY2026 BUDGET column of those
tables and spot-checked by summation against the book's own printed subtotal/total
lines (see the reconciliation printed at the bottom of this script's output).
"""

import csv
import os

FISCAL_YEAR = 2026
SOURCE = "gc-budget-fy2026"

# ---------------------------------------------------------------------------
# Revenue categories (GENERAL FUND REVENUE SUMMARY, printed p.56 / pdf p.57)
# ---------------------------------------------------------------------------
REVENUE_ROWS = [
    {
        "label": "Property taxes",
        "budget": 158487600,
        "note": (
            "59% of GF revenue per book. Budgeted net collections based on $3.6B "
            "estimated assessed valuation, 98% collection rate, 47.7 mills. Matches "
            "the ACFR detailed-schedule revenue category structure (METHODOLOGY.md sec.2/10)."
        ),
        "reconciling": True,
    },
    {
        "label": "County offices",
        "budget": 52972537,
        "note": (
            "20% of GF revenue. 'TOTAL COUNTY OFFICES' rollup of 19 office/source "
            "sub-lines, largest: Emergency Medical Services fees $21,999,249, Code "
            "Enforcement $12,173,672, Register of Deeds $9,354,797, Magistrates "
            "$2,165,000, Clerk of Court $1,509,631, Probate Court $1,566,708, Grading/"
            "Land Development $1,484,569, others smaller. Matches ACFR 'County offices' category."
        ),
        "reconciling": True,
    },
    {
        "label": "Intergovernmental",
        "budget": 29444643,
        "note": (
            "11% of GF revenue. 'TOTAL INTERGOVERNMENTAL' rollup; largest sub-line is "
            "State Allocation (State Aid to Subdivisions, from the Local Government "
            "Fund) $24,150,000. Matches ACFR 'Intergovernmental' category."
        ),
        "reconciling": True,
    },
    {
        "label": "Other revenues",
        "budget": 6772089,
        "note": (
            "2% of GF revenue. 'TOTAL OTHER REVENUE' rollup; largest sub-lines: Cable "
            "Franchise Fees $2,903,840, Interest $1,297,816, Administrative Cost "
            "$1,244,608, County Health Retirees $765,000. Matches ACFR 'Other revenues' "
            "category (this budget book does not break Franchise fees / Interest out as "
            "their own top-level categories the way some ACFR summary-schedule years do "
            "-- see METHODOLOGY.md; they're sub-lines of 'Other' here)."
        ),
        "reconciling": True,
    },
    {
        "label": "Other financing sources (transfers in)",
        "budget": 21414993,
        "note": (
            "8.0% of GF revenue per the book's own framing, but the book's primary "
            "'Total Estimated Financial Sources' line (p.37) and this CSV's reconciling "
            "revenue-categories total EXCLUDE it, matching the ACFR budget-basis "
            "convention of keeping revenue separate from transfers (METHODOLOGY.md "
            "sec.4: 'Money In' = revenue + transfers in, tracked separately). It IS "
            "included in the book's broader 'TOTAL GENERAL FUND REVENUE' figure of "
            "$269,091,862 (p.56: $247,676,869 + $21,414,993 = $269,091,862, matches "
            "exactly). Sources: interfund transfers from the Hospitality Tax SRF, "
            "Infrastructure Bank SRF, Workers Compensation ISF, and State "
            "Accommodations Tax SRF."
        ),
        "reconciling": False,
    },
]

# ---------------------------------------------------------------------------
# Spending categories (GENERAL FUND APPROPRIATIONS SUMMARY, printed p.57 / pdf p.58)
# ---------------------------------------------------------------------------
SPENDING_ROWS = [
    {
        "label": "Administrative services",
        "budget": 3905561,
        "note": (
            "County Council $1,479,395 + Council Administrator (County Administrator) "
            "$1,034,601 + County Attorney $1,391,565. Matches ACFR 'Administrative "
            "services' department."
        ),
        "reconciling": True,
    },
    {
        "label": "Department of Administration",
        "budget": 44035256,
        "note": (
            "Human Resources $1,548,552 + Information Systems $7,581,628 + GIS "
            "$876,529 + Emergency Management $1,245,454 + Emergency Medical Services "
            "$32,783,093. NOTE: this budget book's org structure embeds EMS inside "
            "'Department of Administration' rather than breaking it out as its own "
            "top-level department the way the ACFR detailed schedule does since the "
            "~2013 reclassification (METHODOLOGY.md sec.7/10). There is no separate "
            "'EMS' row at this summary level; $32,783,093 of this $44,035,256 total "
            "is EMS specifically."
        ),
        "reconciling": True,
    },
    {
        "label": "General services",
        "budget": 8864407,
        "note": (
            "Financial Operations $1,820,207 + Procurement Services $749,131 + Tax "
            "Services (Real Property Services/Tax Collector) $6,288,069 + Board of "
            "Appeals $7,000. Roughly maps to ACFR 'General services' department, "
            "though sub-department composition is not identical (e.g. Tax Services "
            "sits here, not under Fiscal services as in the ACFR)."
        ),
        "reconciling": True,
    },
    {
        "label": "Public works",
        "budget": 26595450,
        "note": (
            "Animal Care Services $7,522,214 + Public Works Administration $881,045 + "
            "Engineering and Road Bureaus $7,868,053 + Property Management "
            "$10,324,138 (itemized GENERAL FUND APPROPRIATIONS SUMMARY table, printed "
            "p.57). DATA QUALITY FLAG: the higher-level 'FY2024-FY2026 SUMMARY OF "
            "ESTIMATED FINANCIAL SOURCES AND USES' table on printed p.37 of this same "
            "PDF prints this exact $26,595,450 figure under the label 'Department of "
            "Planning & Development' instead -- the Public Works / Planning & "
            "Development labels appear TRANSPOSED on p.37 relative to the itemized, "
            "reconciling breakdown on p.57 used here. Confirmed by sub-line content "
            "(Animal Care/Engineering/Roads/Property Management are Public Works "
            "functions, not Planning). Treat p.57 as authoritative; p.37 has the swap."
        ),
        "reconciling": True,
    },
    {
        "label": "Planning and development",
        "budget": 5960845,
        "note": (
            "Code Enforcement $4,449,003 + Planning $1,511,842 (itemized GENERAL FUND "
            "APPROPRIATIONS SUMMARY table, printed p.57). Same p.37 label-transposition "
            "flag as the Public works row above applies in reverse: p.37 prints this "
            "figure under 'Department of Public Works' instead. Roughly maps to the "
            "ACFR's 'Community development and planning' department."
        ),
        "reconciling": True,
    },
    {
        "label": "Public safety",
        "budget": 42917200,
        "note": (
            "Detention Center $35,342,906 + Forensics $4,513,424 + Indigent Defense "
            "$279,950 + Records $2,780,920. NOTE: this budget book's 'Public Safety' "
            "department is a NARROWER set of functions (Detention/Forensics/Records/"
            "Indigent Defense) than 'Public safety' typically covers in the ACFR "
            "summary schedule -- Sheriff, Coroner, and Medical Examiner are grouped "
            "separately here under 'Law enforcement services' (see below), not under "
            "Public Safety. Don't assume 1:1 comparability to ACFR 'Public safety' "
            "totals without checking composition."
        ),
        "reconciling": True,
    },
    {
        "label": "Judicial services",
        "budget": 28792234,
        "note": (
            "Circuit Solicitor $9,853,070 + Clerk of Court $5,061,424 + Master in "
            "Equity $911,546 + Magistrates $7,355,632 + Probate Court $3,218,260 + "
            "Public Defender $2,392,302. Matches ACFR 'Judicial services' department."
        ),
        "reconciling": True,
    },
    {
        "label": "Fiscal services",
        "budget": 4533505,
        "note": (
            "Auditor $1,981,601 + Register of Deeds $1,806,542 + Treasurer $745,362. "
            "Matches ACFR 'Fiscal services' department (note Tax Services/Real "
            "Property sits under 'General services' in this budget book, not here -- "
            "see General services note above)."
        ),
        "reconciling": True,
    },
    {
        "label": "Law enforcement services",
        "budget": 84673198,
        "note": (
            "Coroner $3,083,060 + Medical Examiner $1,183,015 + Sheriff $80,407,123. "
            "Matches ACFR 'Law enforcement services' department."
        ),
        "reconciling": True,
    },
    {
        "label": "Boards, commissions & others",
        "budget": 16361432,
        "note": (
            "Printed as 'OTHER SERVICES' in the itemized appropriations table (p.57): "
            "Human Relations $328,433 + Registration and Election $2,049,491 + "
            "Veterans Affairs $547,489 + Employee Benefit Fund $386,004 + Legislative "
            "Delegation $96,538 + Non-Departmental Funds $8,082,619 + Outside Agencies "
            "$4,870,858. Matches ACFR 'Boards, commissions & others' department (the "
            "higher-level p.37 summary table uses this exact label)."
        ),
        "reconciling": True,
    },
    {
        "label": "Capital outlay (department-level GF appropriation)",
        "budget": 0,
        "note": (
            "Printed as an explicit $0 line in the FY2024-FY2026 SUMMARY OF ESTIMATED "
            "FINANCIAL SOURCES AND USES table (p.37) -- no standalone Capital Outlay "
            "department-level row within the $266,639,088 GF appropriations total for "
            "FY2026. NOT zero in substance: narrative text (p.38) separately states a "
            "'General Fund Capital Line Item budget' of $439,457 for FY2026, embedded "
            "within department object-level line items rather than broken out as its "
            "own department row at this summary level. Included here (at $0) for "
            "completeness against the requested category list; adds nothing to the "
            "reconciling total."
        ),
        "reconciling": True,
    },
    {
        "label": "Debt service (department-level GF appropriation)",
        "budget": 0,
        "note": (
            "Printed as explicit $0 lines ('Principal Retirement' and 'Interest and "
            "Fiscal Charges') in the p.37 summary table -- no standalone Debt Service "
            "department-level appropriation within the $266,639,088 GF appropriations "
            "total. Debt service instead appears as a TRANSFER OUT under 'Other "
            "Financing Uses/Debt Service' ($8,052,046 of the $8,502,046 total, see the "
            "'Other financing uses (transfers out)' row below), which the book "
            "excludes from the appropriations total by its own framing. Included here "
            "(at $0) for completeness against the requested category list."
        ),
        "reconciling": True,
    },
    {
        "label": "Other financing uses (transfers out)",
        "budget": 8502046,
        "note": (
            "Matching Funds/Grants $200,000 + Other Financing Uses/Special Revenue "
            "$250,000 + Other Financing Uses/Debt Service $8,052,046 (p.57). EXCLUDED "
            "from the $266,639,088 'Total general fund appropriations' reconciling "
            "total per the book's own framing: 'Total general fund appropriations for "
            "FY2026 are $266,639,088 (exclusive of $8,502,046 for interfund "
            "transfers)' (p.55/56). Included in the book's broader 'TOTAL GENERAL "
            "FUND EXPENDITURES' figure of $275,141,134 ($266,639,088 + $8,502,046, "
            "matches exactly)."
        ),
        "reconciling": False,
    },
]

# ---------------------------------------------------------------------------
# Book-stated totals, for the reconciliation gate
# ---------------------------------------------------------------------------
BOOK_TOTAL_REVENUE_EXCL_TRANSFERS = 247676869   # "Total Estimated Financial Sources", p.37
BOOK_TOTAL_REVENUE_INCL_TRANSFERS = 269091862   # "TOTAL GENERAL FUND REVENUE", p.56
BOOK_TOTAL_APPROPRIATIONS = 266639088           # "Total general fund appropriations", p.55/56
BOOK_TOTAL_EXPENDITURES_INCL_TRANSFERS = 275141134  # "TOTAL GENERAL FUND EXPENDITURES", p.57


def main():
    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fy2026-adopted-budget.csv")

    rows = []
    for r in REVENUE_ROWS:
        rows.append({
            "fiscal_year": FISCAL_YEAR,
            "section": "revenue_categories",
            "label": r["label"],
            "budget": r["budget"],
            "source": SOURCE,
            "note": r["note"],
        })
    for r in SPENDING_ROWS:
        rows.append({
            "fiscal_year": FISCAL_YEAR,
            "section": "spending_categories",
            "label": r["label"],
            "budget": r["budget"],
            "source": SOURCE,
            "note": r["note"],
        })

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["fiscal_year", "section", "label", "budget", "source", "note"])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    # --- Reconciliation ---
    rev_reconciling_sum = sum(r["budget"] for r in REVENUE_ROWS if r["reconciling"])
    rev_all_sum = sum(r["budget"] for r in REVENUE_ROWS)
    spend_reconciling_sum = sum(r["budget"] for r in SPENDING_ROWS if r["reconciling"])
    spend_all_sum = sum(r["budget"] for r in SPENDING_ROWS)

    print(f"Wrote {len(rows)} rows to {out_path}")
    print()
    print("=== REVENUE RECONCILIATION ===")
    print(f"Sum of 4 core revenue category rows (excl. transfers in): {rev_reconciling_sum:,}")
    print(f"Book's stated 'Total Estimated Financial Sources' (p.37): {BOOK_TOTAL_REVENUE_EXCL_TRANSFERS:,}")
    print(f"Match: {rev_reconciling_sum == BOOK_TOTAL_REVENUE_EXCL_TRANSFERS}")
    print(f"Sum incl. transfers in: {rev_all_sum:,}  vs book 'TOTAL GENERAL FUND REVENUE' (p.56): {BOOK_TOTAL_REVENUE_INCL_TRANSFERS:,}  Match: {rev_all_sum == BOOK_TOTAL_REVENUE_INCL_TRANSFERS}")
    print()
    print("=== EXPENDITURE RECONCILIATION ===")
    print(f"Sum of 10 department rows + $0 capital/debt rows (excl. transfers out): {spend_reconciling_sum:,}")
    print(f"Book's stated 'Total general fund appropriations' (p.55/56): {BOOK_TOTAL_APPROPRIATIONS:,}")
    print(f"Match: {spend_reconciling_sum == BOOK_TOTAL_APPROPRIATIONS}")
    print(f"Sum incl. transfers out: {spend_all_sum:,}  vs book 'TOTAL GENERAL FUND EXPENDITURES' (p.57): {BOOK_TOTAL_EXPENDITURES_INCL_TRANSFERS:,}  Match: {spend_all_sum == BOOK_TOTAL_EXPENDITURES_INCL_TRANSFERS}")


if __name__ == "__main__":
    main()
