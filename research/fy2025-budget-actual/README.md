# FY2025 budget-vs-actual research package

Reconciled General Fund budget-versus-actual data for the Greenville County Budget Explorer,
FY2011–FY2025, extracted from the county's audited financial reports (ACFR/CAFR). This package
is the research record behind the site's General Fund budget-versus-actual comparisons.

## Deliverables

| File | What it is |
|---|---|
| `audited-general-fund-series.csv` | The 15-year General Fund flow: revenue, expenditure, transfers, net change, budget-to-GAAP adjustment, and beginning/ending fund balance — final budget vs. actual, per year. |
| `general-fund-revenue-by-year.csv` | **(phase 2)** Revenue by category × 15 years; categories sum exactly to each year's total. |
| `general-fund-expenditure-by-year.csv` | **(phase 2)** Expenditure by department × 15 years; departments (+ labeled residual) sum exactly to each year's total. |
| `fy2025-fund-balance-classifications.csv` | **(phase 2)** FY2025 General Fund balance split: nonspendable / committed / restricted / assigned / unassigned. |
| `fy2025-transfers.csv` | **(phase 2)** FY2025 General Fund transfers in/out by counterparty fund (ACFR Note 8). |
| `fy2025-money-in.csv` | FY2025 revenue by category (original/final budget, actual, variance). |
| `fy2025-money-out.csv` | FY2025 expenditure by department/line (original/final budget, actual, variance). |
| `fy2012-ocr-record.json` | FY2012's hand-verified figures (its book is scanned; OCR-derived). |
| `sources.csv` | Provenance manifest: source code, fiscal year, document, official URL, extraction method for all 15 ACFRs. |
| `series_full.json` | Full extracted record per year (all rows, both bases, revenue/expenditure line detail). |
| `validation-report.md` | Per-year reconciliation results + FY2025 acceptance checks. |
| `findings.md` | Research memo answering five interpretive questions about the series. |
| `scripts/` | The deterministic extractor (`finalize.py`) and the earlier series prototype. |

## What's verified

- **Every year FY2011–FY2025 reconciles** on the authoritative checks: internal
  (`beginning + net change + budget-to-GAAP adjustment = ending`) and the year chain
  (`ending == next year's beginning`), unbroken across all 15 years.
- **FY2025 passes all of its acceptance checks** exactly.

## Scope decisions

- **FY2006–FY2010 excluded** — older budgetary presentation ("fund balance usage," no clean
  beginning/ending fund balance); not comparable to FY2011+ without bespoke cross-statement work.
  Low value (16–20-year-old data) for the resident-facing tool.
- **Phase 2 complete:** multi-year revenue-category and department detail (FY2011–FY2025), FY2025
  fund-balance classifications, and FY2025 transfers tracing are all included and reconciled.
- **Still out of scope:** object-level salary/operations sub-lines (they live in the adopted budget
  books, not the ACFR — see findings), and transfers tracing for years other than FY2025.

## Source archive

The app links each figure to its official greenvillecounty.org page (`source_url`). To fetch the
cited documents and verify them against their recorded hashes, run
`python3 -m scripts.restore_sources`.
