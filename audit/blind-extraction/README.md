# Greenville County budget blind extraction

Blind, source-first extraction completed 2026-07-17 from official `greenvillecounty.org` budget books only. No file from the provisional working dataset, no existing CSV/SQLite/README, and no project narrative research was inspected.

## Scope and coverage

- Fiscal years covered with source-reported values: FY2002–FY2026.
- FY2027: no adopted FY2027 budget book was listed on the official [Management & Budget budget index](https://www.greenvillecounty.org/ManagementandBudget/) as of 2026-07-17. The current listing and book are FY2026 only. No FY2027 value was inferred.
- FY2002–FY2003 come from the comparison columns in the earliest online FY2004–FY2005 official book. Statuses remain `ACTUAL`, `PROJECTED`, or the source's plain `BUDGET` label as applicable.
- FY2022–FY2023 department-level General Fund appropriations are not in
  `general-fund-department-appropriations.csv`: that summary is an embedded raster
  image in the official PDF. It was later transcribed twice and stored separately
  under `data/recovered/` with explicit recovery provenance; the blind extraction
  remains text-source-only.
- The FY2023 consolidated table is also an embedded raster image. Its General Fund revenue, financing, and balance cells were visually transcribed from a 300-dpi rendering of official PDF physical page 40 (printed page 39), then component sums were checked to the printed totals. Those rows say so in `notes`.

See `coverage-by-fiscal-year.csv` for row counts and gaps by year.

## Primary outputs

| File | Rows | Contents |
|---|---:|---|
| `whole-budget-major-funds.csv` | 230 | General, Special Revenue, Debt Service, Enterprise, county-reported `TOTAL BUDGET`, plus Internal Service components/totals and explicit inclusion treatment. |
| `general-fund-operating-categories-and-transfers.csv` | 307 | Broad General Fund operating categories, `TOTAL OPERATING BUDGET`, interfund transfers, and total General Fund budget from expenditure-overview tables. |
| `general-fund-department-appropriations.csv` | 1,301 | Department/detail and category-total rows from text-extractable General Fund Appropriations Summary tables; the separate FY2022–FY2023 image recovery is noted above. |
| `named-special-revenue-funds.csv` | 243 | Named Special Revenue funds and reported Special Revenue total, with original labels (including source asterisks and source-printed zero rows). |
| `general-fund-broad-revenues.csv` | 129 | Broad General Fund financial-source categories and `Total Estimated Financial Sources`. All component sums check to the total for every FY2002–FY2026. |
| `general-fund-balances-and-financing.csv` | 150 | Transfers/other financing, net change, opening/closing General Fund balance, and separately reported reserve/replacement rows where present. |
| `official-document-conflicts.csv` | 112 | Every source-version row in a same-FY/same-label group where official budget books report different values. OCR-only spacing and punctuation differences are normalized for grouping; original labels remain preserved. No reconciliation was guessed. |
| `coverage-by-fiscal-year.csv` | 26 | FY2002–FY2027 coverage matrix and exact gaps. |
| `official-source-registry.csv` | 22 (17 at the 2026-07-17 extraction; 5 added 2026-07-20 with the audited results) | Official landing page plus row-level PDF sources, titles/versions, and URLs. |

## Checkpoints

- `checkpoints/checkpoint-01-overview-all-columns.csv` — 1,489 rows, including repeated comparison columns across official book versions.
- `checkpoints/checkpoint-02-consolidated-general-fund-rows.csv` — 485 parsed General Fund rows before output routing.
- `checkpoints/checkpoint-03-general-fund-appropriations-all-columns.csv` — 2,443 rows across actual/projected/budget comparison columns.

The checkpoints and the `pdfs/`, `text/`, `pages/` and `ocr/` intermediates are not published. Restore the source PDFs with `python3 -m scripts.restore_sources`; the `scripts/blind_extract/` scripts document how the CSVs were produced from them and are kept as a historical record.

## Schema and conventions

All row-level outputs include:

- `fiscal_year`: ending fiscal year as an integer.
- `value`: whole dollars, with commas and currency symbols removed. A source-printed dash/`--` is normalized to integer `0`; no blank cell is shifted into another fiscal year.
- `status`: source column/section status (`ACTUAL`, `PROJECTED`, `PROJECTION`, `BUDGET`, `APPROVED BUDGET`, `ADOPTED BUDGET`, `PROPOSED BUDGET`, `ESTIMATED`, or `BUDGETED FINANCING`).
- `original_label`: label preserved as extracted, including old-book OCR spacing/typos and source asterisks. No cross-year renaming was imposed.
- `source_url`, `document_title_version`, `source_code`: official provenance.
- `pdf_page`: physical PDF page number (1-based).
- `printed_page`: page number printed in the budget book when text-extractable.
- `table_section`: table/section name.
- `ambiguity_flag`, `notes`: row-level caveats. Blank means no row-specific ambiguity identified.

Some files add `fund_type`, `operating_category`, `included_in_reported_total_budget`, and/or `treatment_note`.

## Internal Service Fund treatment

Every official expenditure overview places the Internal Service Fund after `TOTAL BUDGET`. The reported total-budget arithmetic equals General Fund + Special Revenue Fund + Debt Service Fund + Enterprise Fund and excludes Internal Service Fund. `whole-budget-major-funds.csv` therefore marks Internal Service rows `included_in_reported_total_budget=no` and preserves their separately reported amounts. Component sums for the four included fund types equal the county-reported `TOTAL BUDGET` in every FY2002–FY2026.

## Validation performed

- Major included-fund totals reconcile exactly to `TOTAL BUDGET` for all 25 extracted years.
- Named Special Revenue components reconcile exactly to the source-reported Special Revenue total for all 25 extracted years.
- Broad General Fund financial-source components reconcile exactly to `Total Estimated Financial Sources` for all 25 extracted years.
- Every primary row has an official URL, document title/version, and physical PDF page.
- Same-label discrepancies across official books are retained in `official-document-conflicts.csv`; examples include later adopted/amended comparison values differing from an earlier book's proposed/original values.

Independent arithmetic and provenance checks above were run directly against every output row.
