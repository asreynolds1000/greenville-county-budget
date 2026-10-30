# Source-document anomalies

Defects and unusual presentations in the county's own published documents, and how this
dataset handles each. Distinct from extraction errors, which are our defects and get fixed
in place. Every entry here records something the county published that a faithful
transcription cannot represent with a plain number.

Established 2026-07-21.

## The encoding rule these entries exist to enforce

A printed dash means nil under normal accounting presentation, so transcribing it as `0` is
correct in general. There is exactly one case where it is wrong: **a total row whose printed
children carry non-zero budgets.** Zero is arithmetically impossible there, and propagating
it fabricates an overspend on a page whose entire purpose is budget-versus-actual honesty.

Those cells are transcribed as absent (empty), never as zero, and the total is supplied as a
derived value carrying a `derived_value` note.

`scripts/validate_detailed.py` enforces this. A total row that is zero or absent while its
children sum non-zero fails the run.

## A1. FY2018, General Fund, Total public safety: budget columns not printed

**What the county printed** (FY2018 CAFR, printed page 89, PDF page 94, detailed Schedule of
Revenues and Expenditures):

```
   Total public safety                    -            -       27,362,763      401,312
```

The Original Budget and Final Budget cells are dashes. The four sub-department totals
directly above are printed in full:

| Sub-department | Original | Final |
|---|---|---|
| Records management services division | 2,651,623 | 2,367,116 |
| Detention division | 21,980,269 | 22,526,566 |
| Forensic division | 2,658,986 | 2,658,986 |
| Indigent defense | 211,567 | 211,407 |
| **Sum** | **27,502,445** | **27,764,075** |

**Why this is a county defect and not an extraction error.** The source URL in `sources.csv`
was re-fetched on 2026-07-21 and the page was read two ways: `pdftotext -layout`, and
rendered to a 200 dpi PNG and read as an image. Both show dashes. The PDF carries a clean
digital text layer (activePDF Toolkit, 2018), not a scan, and every other figure on the page
extracted correctly, so there is no OCR remedy. The county omitted a total it computed.

**Independent confirmation of the missing figure.** The county printed the variance as
401,312. Final budget minus actual is 27,764,075 − 27,362,763 = 401,312. The county's own
arithmetic therefore proves it worked from a final budget of 27,764,075, not from zero.

**Handling.** Budget cells transcribed as absent in `detailed-expenditure-by-year.csv`. The
production layer carries the derived totals (27,502,445 original, 27,764,075 final) with a
`derived_value` note. Maintainer decision 2026-07-21: reader-facing copy states plainly that the
county's report does not print a total for this line and that the figure is the sum of the
sub-department totals printed on the same page. It does not characterize the omission as a
county error.

**How it was missed twice.** Two prior verification passes reported "all 15 years
reconcile." Both reconciled the actual column and the sub-department level, where FY2018 is
clean. Neither checked a total row against its own children in the budget columns. That is
now a permanent rule, not a one-time script.

## A2. FY2022–FY2025, General Fund, Total debt service: nil appropriation (source-true)

Four rows carry zero in both budget columns against real spending:

| Year | Actual |
|---|---|
| FY2022 | 174,592 |
| FY2023 | 187,561 |
| FY2024 | 828,434 |
| FY2025 | 824,428 |

**These are correct and must not be "fixed."** The FY2025 ACFR was checked directly (printed
page 115): the child line prints dashes as well, and the county itself shows the full amount
as negative variance.

```
   Debt service
     Principal                        -            -           824,428          (824,428)
      Total debt service              -            -           824,428          (824,428)
```

No appropriation was made. The children agree with the total, so the A1 rule correctly does
not fire.

**But it needs explanation, not correction.** General Fund debt service is largely handled
as a transfer-out rather than as an appropriation, so a zero budget line is a presentation
artifact of that structure, not a budgeting failure. Rendered bare, it reads to a resident
as an $824K overspend. FY2025 is already in
`data/production/general_fund_budget_actual_comparison.csv` and on the maintainer-reviewed FY2025
page in exactly that bare form. A `no_appropriation` note is required on all four rows.
