# Anomaly queue

Observations from the source-fidelity audit readers, with page evidence and no verdict
attached. Readers report what looks odd; they do not diagnose it. Adjudication is a separate
pass so the model deciding "county defect versus our error
versus fine" is not the one that formed a first impression.

Four verdicts are available:

- **county-document defect** — the source is wrong or incomplete. Register in
  `source-anomalies.md`, decide the derivation, and add a validator rule that would catch a
  recurrence.
- **extraction error** — our defect. Fix the data.
- **legitimate presentation** — unusual but correct. Close it with a one-line reason so a
  future audit does not re-raise it.
- **needs a human** — escalate to the maintainer with a specific question.

## Volume

67 observations from 13 blind readers (FY2011–FY2024 excluding FY2016), plus 6 from the
FY2016 pilot. Readers were told that flagging a harmless oddity is cheap and silence about a
real one is expensive, so the queue is deliberately over-inclusive.

| Class | Count | Years | Status |
|---|---|---|---|
| Dash or blank where a figure might belong | 33 | 2011–2024, most years | mostly resolved by class, below |
| Label word-order or capitalization drift | 10 | 2011–2017 | resolved by class |
| Unusual variance or mid-year budget swing | 8 | 2013, 2014, 2020, 2021 | resolved by class |
| Total row mislabeled "Total detention division" | 7 | 2018–2024 | **county-document defect**, confirmed |
| Misspelling in a printed label | 6 | 2019, 2020, 2021 | **county-document defect**, cosmetic |
| Other | 3 | 2012, 2021, 2023 | needs the judge pass |

## Resolved by class

### Dash or blank where a figure might belong (33)

Two distinct things wear the same appearance, and telling them apart is the whole point of
the discriminator in `validate_detailed.py`:

- **On a total row whose children carry real budgets**, a dash is a county omission. Exactly
  one instance exists in fifteen years: FY2018 Total public safety, recorded as
  `source-anomalies.md` A1. The FY2018 reader found it independently and independently
  recovered the same figures (27,502,445 and 27,764,075) by two methods, summing the
  sub-departments and back-solving against the grand total.
- **Everywhere else**, a dash is a nil appropriation and is source-true: an object line with
  no budget, a division created mid-year (FY2019 Emergency Management), a budget zeroed
  in-year, a line spent against no appropriation (Debt service FY2022–FY2025, recorded as
  A2), or a planned fund-balance draw that never happened (FY2015, FY2017).

Verdict: **legitimate presentation** for all but the FY2018 case, which is already
registered as a county-document defect with a validator rule behind it.

Reader-facing consequence, and the reason this class is worth 33 flags: several of these are
the most interesting facts on the page. A county that budgeted a $6.68M fund-balance draw
and used none of it (FY2017), or spent $2.4M on retiree claims against no appropriation
(FY2024), is telling a story the site exists to tell. They need notes, not suppression.

### Label word-order or capitalization drift (10)

Independently reported by six readers across FY2011–FY2017 who never saw each other's work.
Two recurring instances: a section headed "Community development and planning" closed by
"Total community **and** development planning" (word order swapped), and "Elected officials -
Law enforcement" closed by "Total elected officials - **l**aw enforcement." FY2019 adds a
trailing colon ("Public safety:").

Verdict: **legitimate presentation**, and decisive for the label policy. The county's
own wording is inconsistent within a single page, so display must carry each year's printed
label rather than a normalized one, joining history through `department-crosswalk.csv`.

### Unusual variance or mid-year budget swing (8)

Large but arithmetically clean: an EMS Salaries variance of $6.2M (FY2020), EMS Salaries
moving $18.5M to $11.8M to $8.7M across original, final, and actual (FY2021), an 82%
mid-year budget cut (FY2013), a Planning and code enforcement revenue line coming in 18x its
budget (FY2021).

Verdict: **legitimate presentation**. Every one reconciles. These are content, not defects.

### Total row mislabeled "Total detention division" (7)

Seven readers across FY2018–FY2024 independently found the same thing: the Emergency
Management division subsection closes with a total row labeled "Total detention division,"
duplicating the label used for the real Detention division above it. The figures are
correct; only the label is wrong.

Verdict: **county-document defect**, cosmetic. This confirms METHODOLOGY §11, which already
warned that these years mislabel that row and that rows must be resolved by structural frame
position rather than label text. Seven independent confirmations is as strong as this
evidence gets. No data change needed; the extraction already resolves by position.

### Misspelling in a printed label (6)

"Total vererans affairs" and "Total Indingent defense," FY2019–FY2021. Confirmed against
rendered page images, so not extraction artifacts.

Verdict: **county-document defect**, cosmetic. Also already in METHODOLOGY §11. Display uses
the printed label, so the site will reproduce the county's spelling; a note should say so
rather than silently correcting a source document.

## Adjudicated by the judge pass (2026-07-21)

Fresh-context judge, given the printed evidence and our stored data but not the readers'
theories about what each item meant. It fetched and read each source PDF rather than
reasoning from the excerpts. **All four close as legitimate presentation. No extraction
errors, no county-document defects, no data changes.**

### Item 1 — FY2012 Public Defender has no Salaries object line — legitimate presentation

The two printed lines sum exactly to the printed sub-department total in all four columns,
so no salaries figure is hidden inside the total; an omitted-but-included line would break
the tie. The same page shows the schedule's house style of dropping object lines with no
appropriation entirely rather than printing a zero row (the Auditor prints no Contractual
agreements line). The 3-rows-then-4-rows series shape reflects a real funding change: the
county carried no Public Defender salary appropriation before FY2014, running the office
through its contractual line.

Consequence: a missing object line is not by itself a transcription gap, and the validator
must not require a fixed object set per sub-department.

Draft reader note: "Before 2014, the county's reports show no salary spending for the Public
Defender's office; its funding ran through operations and contract payments. A salary line
appears starting in fiscal year 2014, when the office's staffing arrangement changed."

### Item 2 — FY2021 unbudgeted revenue with $711,469 received — legitimate presentation

The judge found the explanation inside the same document. The OPEB note (printed pages 87 to
88) describes required monthly retiree contributions toward the county's self-funded retiree
health plan, which is this revenue stream. The spending side entered the General Fund
mid-year: a Nondepartmental "Retiree claims" line was amended from a 21,601 original budget
to a 1,795,029 final budget. The revenue side was never amended, which is ordinary, since
counties amend appropriations while revenue budgets stay estimates. By FY2023 the county
budgets the line outright (750,000 budget against 931,648 actual), confirming an ongoing
stream whose first year simply preceded its budget line.

Draft reader note: "In 2021 the county received $711,469 in insurance premiums paid by
retirees, a category its budget that year had not anticipated. A budget is an estimate set in
advance, so money arriving in an unlisted category shows up as a positive difference. The
county added a budget line for this item in later years."

### Item 3 — FY2023 negative actual of $(40,924) — legitimate presentation

Printed in the source, confirmed against a rendered page image, reconciles inside the
county's own sub-department total, and matches our data. The judge searched the entire FY2023
book for the amount, for Human Resources mentions, and for terms like rebate, reimburse, and
wellness, and **found no explanatory note**. It reported that plainly rather than presenting
a cause as a finding. The general mechanism (credits or refunds posted against a line
exceeding that year's charges, which net against expenditures on a budget basis) is offered
as inference, not as something the document says.

Consequence: negative actuals must stay representable in the schema. They are real source
values.

Draft reader note: "This line shows negative spending for 2023. A negative amount appears
when refunds or credits recorded against a budget line are larger than that year's spending
on it. The figure is exactly as printed in the county's audited report."

### Item 4 — FY2019 detailed schedule versus summary statement — legitimate presentation, with an obligation

This was the real question and it resolved cleanly. The two presentations differ by exactly
each department's capital outlay: the basic financial statement (printed page 24) breaks
capital outlay out into one line, while the detailed schedule leaves it inside each
department. Summing the per-department differences gives 27,893 / 596,399 / 595,932, matching
the statement's Capital outlay line to the dollar in all three columns. Grand totals are
identical on both pages (166,397,858 / 166,399,316 / 164,009,700), and the revenue side
regroups and reconciles the same way.

Neither presentation is wrong. This is normal ACFR structure: the basic statement satisfies
the GASB functional presentation while the supplementary schedule carries departmental
detail.

Draft reader note: "Our department figures come from the county's detailed budget schedule,
which counts each department's capital purchases inside that department's total. The county's
one-page summary statement moves those purchases to a separate 'Capital outlay' line, so its
department totals can look smaller than ours. Both versions add up to the same overall total."

## Obligation from item 4 — MET (2026-07-21)

The basic-statement grand totals were extracted for all 15 years by five blind agents and
committed as `basic-statement-totals.csv`. `scripts/validate_cross_schedule.py` asserts them
against our detailed-schedule sums.

**Result: 90 checks across 15 years, every year reconciles.** Negative-tested by corrupting a
printed total, which fails with the exact difference.

Two things this closed beyond the rule the judge asked for:

1. **It is the first independent check the `original_budget` column has ever had at the
   total level.** `audited-general-fund-series.csv` carries no original-budget figure, which
   is why the fidelity audit had to give every department total in that column full coverage
   rather than sampling. The basic statement prints an original-budget grand total, so that
   column now has a top-level anchor in all 15 years.
2. **The validator reads the committed CSV, not the extraction scratch files.** The first
   version read from a session temp directory. A gate whose inputs can vanish stops checking
   anything the moment they do, and keeps reporting success while it happens. That is the
   most dangerous shape a gate can take, and this project has already been bitten once by a
   check that passed over a defect it was written to catch.

Also confirmed along the way: FY2019's numbers reproduce the judge's spot-check to the dollar
(expenditures 166,397,858 / 166,399,316 / 164,009,700, capital outlay 27,893 / 596,399 /
595,932) from an agent that never saw the judge's work; and the FY2013 basic statement
independently shows the reorganization, dropping "Human resources" and "Public works" and
adding "Emergency medical services" and "Community development and planning."

One presentation change worth carrying into the methodology page: in FY2025 the county moved
this statement out of the Basic Financial Statements into Required Supplementary Information
and retitled it "Schedule" rather than "Statement." Same function-level grouping. Anyone
re-running this extraction on a future year should not assume the earlier location.
