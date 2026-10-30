# FY2026 interfund transfers: what the county names, and what it does not

Research record. It catalogues the interfund transfers the FY2026 budget book names, and
shows which transfers the book does not identify.

## What was read, and how

The county's FY2026 budget book (`data/raw/gc-fy2026/BudgetCombined.pdf`; restore it with
`python3 -m scripts.restore_sources`), from a `pdftotext -layout` text extraction. Every figure
below comes from that extraction, read with `gzip -cd … | nl -ba` so line numbers are ordinary LF lines rather than
Python's `splitlines()`, which also breaks on form feeds and shifts every citation.

**Printed page numbers were read from each page's own printed footer**, by splitting the
extraction on form feeds and taking the last line of the page. That matters: page numbers taken
from memory or from a table of contents were wrong by two to eight pages. The
printed page is consistently one less than the PDF page in this document, and both are stored on
every row, because a printed page number handed to a PDF reader as an index lands on the wrong
table.

| What | LF lines | PDF page | Printed page |
|---|---|---|---|
| Budget in Brief: perimeter sentence and the FY2026 total | 357–368 | 9 | 8 |
| Consolidated fund summary: sources, transfers in/out, fund-balance change | 1838–1878 | 37 | 36 |
| Special Revenue Funds — Other Financing Sources/Uses | — | 48 | 47 |
| General Fund transfers to and from other funds | 7018–7050 | 132 | 131 |
| State Accommodations Tax fund statement | 7174 | 135 | 134 |
| Hospitality Tax fund statement | 7468 | 140 | 139 |
| Infrastructure Bank fund statement | 7532 | 141 | 140 |
| Parks, Recreation & Tourism fund statement | 7805 | 146 | 145 |
| Road Program fund statement | 8051 | 151 | 150 |

## Every row was re-derived, not carried over

Eleven named pairs sum to $50,226,989, computed from the pages above. The Debt Service residual
is $6,727,741 and the Infrastructure Bank residual is $159,825; the last is confirmed
independently below.

## What ties, exactly

Every one of these is checked by `scripts/research/transfer_schedule.py` against control totals
transcribed from the source, not computed from the schedule, so a schedule that drops a row
cannot also move its own target:

- receipts into the General Fund, Special Revenue, Debt Service, Capital Projects and Enterprise,
  each against p.36;
- each of the five Special Revenue senders against its own fund statement;
- those five summing to p.36's Special Revenue transfers out ($57,559,768);
- General Fund outflows against p.36 ($8,502,046);
- Enterprise outflows ($2,812,000) and Internal Service outflows ($2,500,000) against p.36;
- every row's year and book against the controls' (FY2026), every perimeter flag against the
  declared perimeter, every residual formula recomputed from its operands, and both printed
  within-book conflicts kept on their rows with their alternate page.

Not yet checked: per-recipient Special Revenue receipts. Re-pointing a receipt from one Special
Revenue fund to another keeps every control above unchanged; the test suite records that gap as
an expected failure until each recipient's own statement is transcribed as a control.

## The two residuals, and why they are not errors

**Debt Service receipts, $6,727,741 unnamed.** p.36 prints $25,992,655 in. The named senders —
Infrastructure Bank, Hospitality Tax, Road Program, Parks Recreation & Tourism and the General
Fund — total $19,264,914. Debt Service's own statement prints a receipt aggregate and never
itemises it by sender, in this book or the two before it. The difference is a site calculation.

**Infrastructure Bank outflows, $159,825 unnamed.** Its statement prints $36,888,650 out. The
p.47 bullets name $36,728,825 of it, using **p.47 Sources'** road-transfer amount of $5,662,298.
An earlier figure of $159,914 came from using **p.47 Uses'** $5,662,209 instead. Both
amounts are printed on the same page of the same book, $89 apart, so the "latest book wins"
policy cannot arbitrate between them. Both are retained, on the row, with their pages.

A second conflict of the same shape: the Hospitality Tax transfer to the General Fund is
$2,162,116 on p.131 and $2,162,115 on p.47. With p.131's figure the Hospitality Tax statement
ties to the dollar; with p.47's it is $1 short. Both retained.

## What this does not establish

It does not establish what the county spends on services once transfers are removed, and the
residuals are not an interval around that. Debt Service alone budgets a **$2,520,467 increase in
fund balance** in FY2026 (p.36), so a receipt need not become expenditure in the same year.
Three further gaps sit in the schedule as rows rather than as prose: the $10,000,000 Enterprise
receipt that p.36 calls a transfer and p.51 calls a bond issuance, the $2,812,000 Enterprise
outflow with no named destination, and the two matching-grant outflows whose receiving fund is
never identified as inside or outside the published total.

## Coverage

**FY2026 only.** Adding FY2022–FY2025 is source work that needs the FY2022-23 and FY2024-25
books extracted the same way. The schedule's columns carry a year, but the
validator's control totals are FY2026 literals (`CONTROL_YEAR`, `PAGE_36`, `SR_SENDER_PAGES`,
`CONFLICTS` in `scripts/research/transfer_schedule.py`) and it refuses any other year or book;
each added year needs its own transcribed controls.

## Files

| File | What it is |
|---|---|
| `transfer_schedule.csv` | 21 rows: 19 county-named entries and 2 site derivations |
| `preview.md` | generated by the validator; regenerate with `--preview`, never hand-edit |
| `../../scripts/research/transfer_schedule.py` | the validator and preview generator |
| `../../tests/test_transfer_schedule.py` | the positive case, then each mutation the validator must refuse; one expected failure records the within-Special-Revenue swap it cannot yet catch |
