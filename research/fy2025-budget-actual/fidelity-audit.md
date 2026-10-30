# Source-fidelity audit

Blind re-reads of sampled cells against the source PDFs. Every other gate in this project
tests internal consistency: totals against their parts, years against their neighbours,
datasets against each other. Those checks all pass on a year that was transcribed wrongly
but consistently. This is the only check that compares our numbers to the printed page.

Before this ran, only FY2025 had two independent extractions behind it. FY2018 had already
shown that an extractor and its verifier can share a blind spot.

**Result: 423 cells sampled across 14 years, 415 exact matches, 8 accounted for by a
documented convention, zero mismatches.**

## Method

For each year, a fresh agent receives the source PDF URL and a list of cell coordinates. It
does not receive our values and is instructed not to open the research or production
repositories, so its reading is independent rather than a confirmation pass. It reports each
cell exactly as printed, including dashes, blanks, and parentheses, plus the printed label it
used, so era label drift becomes visible.

The sample is stratified and drawn with a per-year seed:

- **every department-total row in the `original_budget` column.** No internal check reaches
  that column, because `audited-general-fund-series.csv` carries no original-budget figure.
  It is the largest blind spot in the dataset, so it gets full coverage rather than sampling.
- three department totals in `actual`
- six sub-department totals, column chosen at random
- eight object rows, column chosen at random
- four revenue sublines, column chosen at random

Readers also report anomalies on the pages they read, whether or not those touch a sampled
cell, with no verdict attached. Those go to `anomaly-queue.md`. This half exists because
FY2018 was not a mismatch: our value and the page agreed, and the page was the thing that was
wrong. A pass/fail audit scores that as success.

Comparison is by `scripts/compare_fidelity_sample.py`. It parses a dash or blank as absent
rather than 0, because absent is not zero and that distinction is what FY2018 turned on.

## Results

| Year | Sampled | Exact | Dash-as-nil | Mismatch | Anomalies | Status |
|---|---|---|---|---|---|---|
| FY2011 | 30 | 30 | 0 | 0 | 3 | PASS |
| FY2012 | 30 | 30 | 0 | 0 | 5 | PASS (no text layer, read visually) |
| FY2013 | 30 | 29 | 1 | 0 | 10 | PASS |
| FY2014 | 30 | 30 | 0 | 0 | 6 | PASS |
| FY2015 | 30 | 30 | 0 | 0 | 4 | PASS |
| FY2016 | 30 | 30 | 0 | 0 | 6 | PASS (pilot) |
| FY2017 | 30 | 29 | 1 | 0 | 8 | PASS |
| FY2018 | 30 | 30 | 0 | 0 | 3 | PASS (after correction) |
| FY2019 | 30 | 30 | 0 | 0 | 5 | PASS |
| FY2020 | 30 | 29 | 1 | 0 | 6 | PASS |
| FY2021 | 30 | 30 | 0 | 0 | 8 | PASS |
| FY2022 | 31 | 30 | 1 | 0 | 3 | PASS |
| FY2023 | 31 | 30 | 1 | 0 | 3 | PASS |
| FY2024 | 31 | 28 | 3 | 0 | 3 | PASS |
| FY2025 | n/a | n/a | n/a | n/a | n/a | verified by dual independent extraction |

"Dash-as-nil" counts cells where the county printed a dash and we store 0. Below the
department-total level, and on a total row whose children are also nil, that is the standard
accounting reading and is applied consistently across all fifteen years. The comparator
applies the same discriminator as `validate_detailed.py`: on a total row whose children carry
real budgets, a dash can never be zero, and that case still hard-fails.

Zero low-confidence or medium-confidence reads across all 423 cells. Every reader rendered
its pages as images and checked them against the text extraction rather than trusting
`pdftotext -layout` alone, and several reported catching apparent column shifts in raw text
that were clean on the page.

## What the audit caught

**FY2018 (the reason this exists).** The reader independently found the broken
"Total public safety" row and independently recovered the same two figures, 27,502,445 and
27,764,075, by two methods: summing the four sub-department totals, and back-solving the
grand total against every other department. That is confirmation from a reader who had never
seen our data or our conclusion.

**A regression in our own work.** On the first pass the FY2018 correction was applied, then
silently reverted by a `git checkout --` during a negative test of the validator, and the
commit that claimed to make the fix did not contain it. `validate_detailed.py` passed anyway,
because a row registered in `DERIVED_TOTALS` was allowed to hold either an absent cell or a
0. The blind read plus the comparator caught it. Both holes are now closed: the correction is
re-applied, and a registered derived total must be stored absent or the pipeline fails.

This is the strongest available argument for the audit. The defect it caught was not the
county's, it was ours, and every internal check we had passed over it.

**Corroboration of documented findings.** Blind readers independently rediscovered the
"Total detention division" mislabel (7 years), the "vererans" and "Indingent" misspellings
(3 years), the label word-order and capitalization drift (6 years), the FY2016 land-sale flow
residual to the dollar, and the two-schedule structure in METHODOLOGY §2. None of these
readers saw our documentation.

## FY2012 is not what we thought

METHODOLOGY has described FY2012 as scanned, OCR-extracted, and lower-confidence. The reader
established otherwise. `pdftotext` does return garbage (585,676 characters, 0.37%
alphabetic), but `pdftoppm` renders crisp vector-quality pages, not photographed paper. The
cause is a print driver that embedded fonts without a usable ToUnicode or CID map: extraction
fails while rendering stays perfect. All 30 sampled cells read at high confidence with no
ambiguous characters, and all 30 matched.

The reader-facing caveat should be narrowed accordingly. FY2012 figures were not guessed from
a degraded image; they were read from a clean render whose text layer was unusable. One label
carries damage. That is a materially different claim from "OCR, lower confidence," and the
narrower one is the true one.

## Cross-schedule reconciliation (added 2026-07-21)

A separate gate, raised by the judge pass and now in place:
`scripts/validate_cross_schedule.py` asserts our grand totals against the totals the county
prints on its own basic budget-versus-actual statement, which is a different presentation of
the same year (capital outlay pulled into one line rather than left inside each department).

**90 checks across all 15 years, every year reconciles.** Source data is
`basic-statement-totals.csv`, extracted by five blind agents. Negative-tested.

This partially closes the `original_budget` gap named in the limits below. That column has no
figure in `audited-general-fund-series.csv`, so nothing internal could reach it; the basic
statement prints an original-budget grand total, giving it a top-level anchor in every year
for the first time. Department-level original budgets still rest on the fidelity sample plus
their children.

## Limits of this audit, stated plainly

- It is a sample, not a full re-read. 423 of roughly 2,900 numeric cells.
- Department totals in `original_budget` are the exception and got full coverage, because
  nothing else can reach them.
- A consistent error at both the total and child level in an unsampled department would
  survive both this audit and every reconciliation check. Nothing available short of a full
  independent re-extraction closes that.
- Readers were not asked to verify revenue category totals or the closing financing section
  systematically, though several did so unprompted and reported them clean.
