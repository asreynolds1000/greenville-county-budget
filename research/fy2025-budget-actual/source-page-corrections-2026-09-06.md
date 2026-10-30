---
type: research
date: 2026-09-06
status: complete
---

# Audited General Fund citation-page corrections

Date: 2026-09-06

## Scope

`data/production/observations/general-fund-audited-series-extension.csv` carries the audited
General Fund observations absent from the frozen blind extraction. The generator had cited the
first page of the detailed schedule for every generated observation. That page supports Total
revenues only; it does not support expenditure, transfer, or early-year fund-balance bridge
lines.

This correction changes source metadata only. The 93 generated values were checked against
`data/production/general_fund_audited_series.csv`; no value, status, source URL, or source
code changed. FY2025 is supplied by the frozen extraction and already has its verified
citations, so it was not edited.

## Verified page classes

For FY2011-FY2024, the generated rows now use these cited locations:

- **Total revenues:** the first page of the detailed General Fund schedule.
- **Total expenditures, Transfers in, and Transfers out:** the final page of that detailed
  schedule. This is 42 generated rows.
- **Fund balance beginning, Net change in fund balances, Fund balance ending, and the FY2011-
  FY2017 Budget-to-GAAP adjustment:** the one-page audited budget-and-actual statement. This
  statement explicitly prints the fund-balance bridge. This is 37 generated rows.

The latter citation must use the statement's printed footer, not the page offset for the later
detailed schedule. FY2011, for example, is PDF 42 / printed 28 for the statement and PDF 97 /
printed 79 through PDF 103 / printed 85 for the detailed schedule.

## Original-PDF verification ledger

The detailed-schedule page pairs below come from
`research/fy2025-budget-actual/printed-page-offsets.csv`. Each final page was checked against
the original local ACFR for Total expenditures, Transfers in, and Transfers out; it also closes
the schedule's budget-basis result. FY2012 has no usable text layer and was rendered and
visually checked at PDF 101 / printed 95. The statement pairs come from the existing
source-backed `basic-statement-totals.csv`; FY2012 PDF 34 / printed 29 was also visually
rendered and shows the bridge, including the Note 1-D adjustment.

| FY | detailed revenue PDF / printed | detailed closing PDF / printed | audited statement PDF / printed |
| --- | --- | --- | --- |
| 2011 | 97 / 79 | 103 / 85 | 42 / 28 |
| 2012 | 95 / 89 | 101 / 95 | 34 / 29 |
| 2013 | 104 / 92 | 109 / 97 | 40 / 30 |
| 2014 | 107 / 97 | 112 / 102 | 39 / 31 |
| 2015 | 106 / 96 | 111 / 101 | 39 / 31 |
| 2016 | 100 / 96 | 105 / 101 | 35 / 31 |
| 2017 | 100 / 93 | 105 / 98 | 37 / 31 |
| 2018 | 92 / 87 | 96 / 91 | 37 / 33 |
| 2019 | 115 / 87 | 121 / 93 | 47 / 24 |
| 2020 | 103 / 85 | 109 / 91 | 40 / 24 |
| 2021 | 105 / 88 | 111 / 94 | 38 / 23 |
| 2022 | 110 / 93 | 116 / 99 | 40 / 25 |
| 2023 | 107 / 90 | 113 / 96 | 39 / 24 |
| 2024 | 106 / 89 | 112 / 95 | 39 / 24 |
| 2025 | 109 / 91 | 115 / 97 | 102 / 85 |

FY2019, FY2021, FY2023, and FY2024 have some fund-balance rows in the frozen extraction;
their extension rows are flows only. The ledger is nevertheless complete through FY2025 so the
source boundary and the frozen FY2025 exception are explicit.

## Regression coverage

`tests/test_audited_citation_pages.py` validates both the checked-in extension and a temporary
fresh generator output. It requires the statement pages for bridge rows, first detailed pages
for revenue, and final detailed pages for closing flows. It also checks every generated value
against the curated audited series, so a citation repair cannot change a dollar amount.
